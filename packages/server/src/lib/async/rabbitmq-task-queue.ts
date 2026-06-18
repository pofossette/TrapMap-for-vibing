import type { Task, TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
import type { RuntimeWorkerHandle } from '@trapmap/server/lib/runtime/runtime-contract.js';
import type { AsyncTaskTransport } from './transport.js';

interface RabbitMqMessage {
  content: Buffer;
  fields: {
    routingKey: string;
  };
  properties?: {
    messageId?: string;
    priority?: number;
  };
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
  assertQueue(
    queue: string,
    options?: Record<string, unknown>,
  ): Promise<unknown> | unknown;
  bindQueue(
    queue: string,
    exchange: string,
    pattern: string,
  ): Promise<unknown> | unknown;
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
  options: {
    priority: number;
    maxAttempts: number;
    delayMs: number;
    dedupeKey: string | null;
  };
}

export interface RabbitMqTaskConsumer extends RuntimeWorkerHandle {
  run(): Promise<void>;
  stop(): Promise<void>;
}

export interface RabbitMqTaskTransport extends AsyncTaskTransport {
  kind: 'rabbitmq-task-queue';
  createConsumer(params: {
    handlers: TaskHandler<unknown>[];
    ownsWork: boolean;
  }): Promise<RabbitMqTaskConsumer>;
}

export interface RabbitMqTaskTransportConfig {
  url: string;
  exchange: string;
  queue: string;
  prefetch: number;
  channelFactory?: () => Promise<RabbitMqChannelLike>;
  connectionFactory?: () => Promise<RabbitMqConnectionLike>;
}

function generateEnvelopeId(): string {
  return `rtmq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadAmqplib() {
  const importer = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{
    connect: (url: string) => Promise<RabbitMqConnectionLike>;
  }>;
  return importer('amqplib');
}

async function createDefaultConnection(url: string): Promise<RabbitMqConnectionLike> {
  const amqplib = await loadAmqplib();
  return amqplib.connect(url);
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

  async function getOrCreatePublishChannel(): Promise<RabbitMqChannelLike> {
    if (!publishChannelPromise) {
      publishChannelPromise = (async () => {
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
    }

    return publishChannelPromise;
  }

  return {
    kind: 'rabbitmq-task-queue',
    async enqueue<T>(
      type: string,
      payload: T,
      options: {
        priority?: number;
        maxAttempts?: number;
        delayMs?: number;
        dedupeKey?: string;
      } = {},
    ) {
      const channel = await getOrCreatePublishChannel();
      const envelope: RabbitMqTaskEnvelope<T> = {
        id: generateEnvelopeId(),
        type,
        payload,
        options: {
          priority: options.priority ?? 0,
          maxAttempts: options.maxAttempts ?? 3,
          delayMs: options.delayMs ?? 0,
          dedupeKey: options.dedupeKey ?? null,
        },
      };

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
      options: {
        priority?: number;
        maxAttempts?: number;
        delayMs?: number;
        dedupeKey?: string;
      } = {},
    ) {
      return this.enqueue(type, payload, options);
    },
    async requeue(taskId: string) {
      throw new Error(`RabbitMQ task transport does not support requeue by task id: ${taskId}`);
    },
    async getStatusSnapshot() {
      return {
        provider: 'rabbitmq' as const,
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        backlogOldestAgeSeconds: null,
        runningOldestAgeSeconds: null,
        deadOldestAgeSeconds: null,
        reclaimCount: 0,
        recentDeadLetters: [],
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
          if (config.channelFactory) {
            channel = await config.channelFactory();
          } else {
            connection = await (config.connectionFactory
              ? config.connectionFactory()
              : createDefaultConnection(config.url));
            channel = await connection.createChannel();
          }

          await ensureTopology(channel, config);
          if (!channel.consume) {
            throw new Error('RabbitMQ channel does not support consume()');
          }

          const consumeOk = await channel.consume(
            config.queue,
            async (message) => {
              if (!message) return;

              const routingKey = message.fields.routingKey;
              const handler = handlerMap.get(routingKey);
              if (!handler) {
                channel?.nack?.(message, false, false);
                return;
              }

              const raw = JSON.parse(message.content.toString('utf8')) as RabbitMqTaskEnvelope;
              const task: Task = {
                id: raw.id,
                type: raw.type,
                payload: raw.payload,
                status: 'running',
                priority: raw.options.priority,
                attempts: 0,
                maxAttempts: raw.options.maxAttempts,
                lastError: null,
                dedupeKey: raw.options.dedupeKey,
                processAfter: new Date(),
                workerId: 'rabbitmq-consumer',
                startedAt: new Date(),
                heartbeatAt: null,
                leaseUntil: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                completedAt: null,
              };

              try {
                await handler.handle(task, new AbortController().signal);
                channel?.ack?.(message);
              } catch {
                channel?.nack?.(message, false, true);
              }
            },
            { noAck: false },
          );
          consumerTag = consumeOk.consumerTag;
        },
        async stop() {
          running = false;
          if (consumerTag && channel?.cancel) {
            await channel.cancel(consumerTag);
          }
          await channel?.close?.();
          await connection?.close?.();
        },
        isRunning() {
          return running;
        },
        ownsWork() {
          return ownsWork;
        },
      };
    },
  };
}
