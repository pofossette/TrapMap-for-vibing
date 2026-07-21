import type {
  TaskConsumerHandle,
  TaskEnqueueOptions,
  TaskHandler,
  TaskQueuePort,
} from '@trapmap/backend-core';

interface RabbitMqMessage {
  content: Buffer;
  fields: { routingKey: string };
}

interface RabbitMqConsumeOk {
  consumerTag: string;
}

export interface RabbitMqChannelLike {
  assertExchange(
    exchange: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<unknown> | unknown;
  assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown> | unknown;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown> | unknown;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean;
  prefetch?(count: number): Promise<unknown> | unknown;
  consume?(
    queue: string,
    onMessage: (message: RabbitMqMessage | null) => void | Promise<void>,
    options?: Record<string, unknown>,
  ): Promise<RabbitMqConsumeOk> | RabbitMqConsumeOk;
  cancel?(consumerTag: string): Promise<unknown> | unknown;
  ack?(message: RabbitMqMessage): void;
  nack?(message: RabbitMqMessage, allUpTo?: boolean, requeue?: boolean): void;
  close?(): Promise<unknown> | unknown;
}

interface RabbitMqConnectionLike {
  createChannel(): Promise<RabbitMqChannelLike>;
  close?(): Promise<unknown> | unknown;
}

export interface RabbitMqTaskEnvelope<T = unknown> {
  id: string;
  type: string;
  payload: T;
  options: { priority: number; maxAttempts: number; delayMs: number; dedupeKey: string | null };
}

export interface RabbitMqTaskTransportConfig {
  url: string;
  exchange: string;
  queue: string;
  prefetch: number;
  channelFactory?: () => Promise<RabbitMqChannelLike>;
  connectionFactory?: () => Promise<RabbitMqConnectionLike>;
}

export type RabbitMqTaskTransport = TaskQueuePort & {
  kind: 'rabbitmq-task-queue';
  enqueueTx<T>(
    client: unknown,
    type: string,
    payload: T,
    options?: TaskEnqueueOptions,
  ): Promise<unknown>;
  createConsumer(params: {
    handlers: TaskHandler<unknown>[];
    ownsWork: boolean;
  }): Promise<TaskConsumerHandle>;
};

async function createDefaultConnection(url: string): Promise<RabbitMqConnectionLike> {
  const importer = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ connect: (connectionUrl: string) => Promise<RabbitMqConnectionLike> }>;
  return (await importer('amqplib')).connect(url);
}

async function ensureTopology(
  channel: RabbitMqChannelLike,
  config: Pick<RabbitMqTaskTransportConfig, 'exchange' | 'queue' | 'prefetch'>,
): Promise<void> {
  await channel.assertExchange(config.exchange, 'topic', { durable: true });
  await channel.assertQueue(config.queue, { durable: true });
  await channel.bindQueue(config.queue, config.exchange, '#');
  await channel.prefetch?.(config.prefetch);
}

export function createRabbitMqTaskTransport(
  config: RabbitMqTaskTransportConfig,
): RabbitMqTaskTransport {
  let publishChannelPromise: Promise<RabbitMqChannelLike> | null = null;
  let publishConnection: RabbitMqConnectionLike | null = null;
  const getPublishChannel = () => {
    publishChannelPromise ??= (async () => {
      if (config.channelFactory) {
        const channel = await config.channelFactory();
        await ensureTopology(channel, config);
        return channel;
      }
      publishConnection = await (config.connectionFactory
        ? config.connectionFactory()
        : createDefaultConnection(config.url));
      const channel = await publishConnection.createChannel();
      await ensureTopology(channel, config);
      return channel;
    })();
    return publishChannelPromise;
  };

  return {
    kind: 'rabbitmq-task-queue',
    async enqueue<T>(type: string, payload: T, options: TaskEnqueueOptions = {}) {
      const envelope: RabbitMqTaskEnvelope<T> = {
        id: `rtmq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        payload,
        options: {
          priority: options.priority ?? 0,
          maxAttempts: options.maxAttempts ?? 3,
          delayMs: options.delayMs ?? 0,
          dedupeKey: options.dedupeKey ?? null,
        },
      };
      const channel = await getPublishChannel();
      channel.publish(config.exchange, type, Buffer.from(JSON.stringify(envelope), 'utf8'), {
        persistent: true,
        priority: envelope.options.priority,
        messageId: envelope.id,
      });
      return envelope;
    },
    async enqueueTx<T>(
      _client: unknown,
      type: string,
      payload: T,
      options: TaskEnqueueOptions = {},
    ) {
      return this.enqueue(type, payload, options);
    },
    async requeue(taskId) {
      throw new Error(`RabbitMQ task transport does not support requeue by task id: ${taskId}`);
    },
    async getStatusSnapshot() {
      return {
        provider: 'rabbitmq',
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        reclaimCount: 0,
      };
    },
    async createConsumer({ handlers, ownsWork }) {
      const handlerMap = new Map(handlers.map((handler) => [handler.type, handler]));
      let running = false;
      let consumerTag: string | null = null;
      let channel: RabbitMqChannelLike | null = null;
      let connection: RabbitMqConnectionLike | null = null;
      return {
        async run() {
          if (running || !ownsWork || handlerMap.size === 0) {
            running = ownsWork && handlerMap.size > 0;
            return;
          }
          running = true;
          if (config.channelFactory) channel = await config.channelFactory();
          else {
            connection = await (config.connectionFactory
              ? config.connectionFactory()
              : createDefaultConnection(config.url));
            channel = await connection.createChannel();
          }
          await ensureTopology(channel, config);
          if (!channel.consume) throw new Error('RabbitMQ channel does not support consume()');
          const consumed = await channel.consume(
            config.queue,
            async (message) => {
              if (!message) return;
              const handler = handlerMap.get(message.fields.routingKey);
              if (!handler) {
                channel?.nack?.(message, false, false);
                return;
              }
              const task = JSON.parse(message.content.toString('utf8')) as RabbitMqTaskEnvelope;
              try {
                await handler.handle(
                  { id: task.id, type: task.type, payload: task.payload, attempt: 0 },
                  new AbortController().signal,
                );
                channel?.ack?.(message);
              } catch {
                channel?.nack?.(message, false, false);
              }
            },
            { noAck: false },
          );
          consumerTag = consumed.consumerTag;
        },
        async stop() {
          running = false;
          if (consumerTag && channel?.cancel) await channel.cancel(consumerTag);
          await channel?.close?.();
          await connection?.close?.();
        },
        isRunning: () => running,
        ownsWork: () => ownsWork,
      };
    },
  };
}
