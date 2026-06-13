import type { FastifyInstance } from 'fastify';

import {
  shouldBootOutboxWorker,
  shouldBootTaskWorker,
  type RuntimeMode,
} from './runtime-mode.js';
import { bootstrapLifecycle } from './bootstrap-lifecycle.js';
import { bootstrapWorkers } from './bootstrap-workers.js';

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
