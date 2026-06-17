import type { FastifyInstance } from 'fastify';

import { getServiceUnitProfile } from '@trapmap/server/lib/runtime/service-unit.js';
import { bootstrapLifecycle } from './bootstrap-lifecycle.js';
import { bootstrapWorkers } from './bootstrap-workers.js';
import { type RuntimeMode, shouldBootOutboxWorker, shouldBootTaskWorker } from './runtime-mode.js';

export async function runWorkerSequence(app: FastifyInstance, mode: RuntimeMode): Promise<void> {
  const serviceUnitProfile = getServiceUnitProfile(app.skillShareer.serviceUnit, mode);
  await bootstrapWorkers(app, {
    enabled: shouldBootTaskWorker(mode),
    ownCandidateTaskWork: serviceUnitProfile.ownsCandidateTaskWork,
    ownSharedJobTaskWork: serviceUnitProfile.ownsSharedJobTaskWork,
  });
  await bootstrapLifecycle(app, {
    startOutboxWorker: shouldBootOutboxWorker(mode) && serviceUnitProfile.ownsOutboxWork,
    ownsOutboxWork: serviceUnitProfile.ownsOutboxWork,
  });
}
