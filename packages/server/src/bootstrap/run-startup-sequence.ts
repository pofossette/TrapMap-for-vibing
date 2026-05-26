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
import { bootstrapLifecycle } from './bootstrap-lifecycle.js';
import { bootstrapRepositories } from './bootstrap-repositories.js';
import { bootstrapWorkers } from './bootstrap-workers.js';

export async function runStartupSequence(app: FastifyInstance): Promise<void> {
  await bootstrapRepositories(app);
  await bootstrapCandidateRecovery(app);
  await bootstrapWorkers(app);
  await bootstrapGraphReconciliation(app);
  await bootstrapLifecycle(app);
}
