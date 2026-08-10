import type { JobRuntimePort } from '@trapmap/backend-core';
import { createFastifyAdapter } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';

import { type JobRuntimeServiceDeps, createJobRuntimeServiceModule } from './deps.js';
import { type JobRuntimeOutboxConsumer, createJobRuntimeOutboxConsumer } from './outbox-worker.js';
import { createJobRuntimeRouteDefs } from './routes.js';

export interface JobRuntimeServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface JobRuntimeServer {
  app: FastifyInstance;
  module: JobRuntimePort;
  outboxConsumer?: JobRuntimeOutboxConsumer;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createJobRuntimeServer(
  config: JobRuntimeServiceConfig,
  deps: JobRuntimeServiceDeps,
): Promise<JobRuntimeServer> {
  const module = createJobRuntimeServiceModule(deps);
  const app = createFastifyAdapter(createJobRuntimeRouteDefs(module), module, {
    logger: { level: config.logLevel },
  });
  const taskConsumer = deps.queuePorts.task.createConsumer
    ? await deps.queuePorts.task.createConsumer({
        handlers: deps.taskHandlers ?? [],
        ownsWork: deps.ownsWork ?? true,
      })
    : null;

  if (taskConsumer && (deps.ownsWork ?? true)) {
    void taskConsumer.run();
  }
  const outboxConsumer = deps.outboxHandlers
    ? createJobRuntimeOutboxConsumer({
        outbox: deps.queuePorts.outbox,
        handlers: deps.outboxHandlers,
        ownsWork: deps.ownsWork ?? true,
        onError(error, event) {
          app.log.error(
            { error, eventName: event?.eventName, aggregateId: event?.aggregateId },
            'Job-runtime outbox event handler failed',
          );
        },
      })
    : undefined;
  if (outboxConsumer && (deps.ownsWork ?? true)) {
    void outboxConsumer.run();
  }

  return {
    app,
    module,
    ...(outboxConsumer ? { outboxConsumer } : {}),
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await taskConsumer?.stop();
      await outboxConsumer?.stop();
      await app.close();
    },
  };
}
