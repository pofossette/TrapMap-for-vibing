import type { JobRuntimePort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';

import { type JobRuntimeDeps, createJobRuntimeServiceModule } from './deps.js';
import { registerJobRuntimeRoutes } from './routes.js';

export interface JobRuntimeServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface JobRuntimeServer {
  app: FastifyInstance;
  module: JobRuntimePort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createJobRuntimeServer(
  config: JobRuntimeServiceConfig,
  deps: JobRuntimeDeps,
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

  return {
    app,
    module,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await taskConsumer?.stop();
      await app.close();
    },
  };
}
