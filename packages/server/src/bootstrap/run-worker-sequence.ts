import type { FastifyInstance } from 'fastify';

import { bootstrapLifecycle } from './bootstrap-lifecycle.js';
import { bootstrapWorkers } from './bootstrap-workers.js';
import { type RuntimeMode, shouldBootOutboxWorker, shouldBootTaskWorker } from './runtime-mode.js';

export async function runWorkerSequence(app: FastifyInstance, mode: RuntimeMode): Promise<void> {
  await bootstrapWorkers(app, {
    enabled: shouldBootTaskWorker(mode),
    ownsWork: shouldBootTaskWorker(mode),
  });
  await bootstrapLifecycle(app, {
    startOutboxWorker: shouldBootOutboxWorker(mode),
    ownsOutboxWork: shouldBootOutboxWorker(mode),
  });
}
