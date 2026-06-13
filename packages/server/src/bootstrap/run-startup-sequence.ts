/**
 * Startup sequence orchestrator.
 *
 * Replaces the scattered onReady hooks in app.ts with a single, ordered
 * startup sequence. Each step is in its own module and has clear
 * prerequisites:
 *
 *   1. Repositories (migrations, repos, vector index)
 *   2. Candidate recovery (re-enqueue interrupted candidates)
 *   3. Workers (task worker for candidate processing)
 *   4. Graph reconciliation (reconcile graph indexes)
 *   5. Lifecycle (event subscribers + outbox worker)
 */

import type { FastifyInstance } from 'fastify';

import { bootstrapCandidateRecovery } from './bootstrap-candidate-recovery.js';
import { bootstrapGraphReconciliation } from './bootstrap-graph-reconciliation.js';
import { bootstrapRepositories } from './bootstrap-repositories.js';
import { runWorkerSequence } from './run-worker-sequence.js';
import { shouldBootApiRuntime, type RuntimeMode } from './runtime-mode.js';

export async function runStartupSequence(
  app: FastifyInstance,
  mode: RuntimeMode = 'combined',
): Promise<void> {
  await bootstrapRepositories(app);

  if (shouldBootApiRuntime(mode)) {
    await bootstrapCandidateRecovery(app);
    await bootstrapGraphReconciliation(app);
  }

  await runWorkerSequence(app, mode);
  Object.freeze(app.skillShareer);
}
