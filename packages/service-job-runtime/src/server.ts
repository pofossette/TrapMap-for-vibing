import type { JobRuntimePort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';

import { createJobRuntimeOutboxConsumer, type JobRuntimeOutboxConsumer } from './outbox-worker.js';
import { type JobRuntimeServiceDeps, createJobRuntimeServiceModule } from './deps.js';
import { registerJobRuntimeRoutes } from './routes.js';

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
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createJobRuntimeServiceModule(deps);
  registerJobRuntimeRoutes(app, module);
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
