/**
 * Bootstrap workers — create and start the task worker for candidate processing.
 *
 * Runs AFTER repositories are initialized so that repos.candidate is available
 * for the candidate processing handler.
 */

import type { FastifyInstance } from 'fastify';

import { createCandidateProcessingHandler } from '@trapmap/server/lib/candidates/index.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { type TaskHandler, createTaskWorker } from '@trapmap/server/lib/queue/task-queue.js';

export interface BootstrapWorkersOptions {
  enabled?: boolean;
  ownsWork?: boolean;
}

export async function bootstrapWorkers(
  app: FastifyInstance,
  options: BootstrapWorkersOptions = {},
): Promise<void> {
  const store = app.skillShareer.store;
  const { enabled = true, ownsWork = enabled } = options;

  // Only runs when using PostgresStore (databaseUrl configured)
  if (!(store instanceof PostgresStore)) return;

  const pool = store.getPool();

  const handler = createCandidateProcessingHandler({
    store,
    getSnapshot: () => store.snapshot(),
    pool,
    // Use PG-based duplicate detection if embeddings are configured
    usePgDuplicateDetection: () => app.skillShareer.ai.embeddings.isConfigured,
    // candidate processing via PG repository
    candidateRepo: app.skillShareer.repos.candidate,
    // LLM-based duplicate adjudication
    chat: app.skillShareer.ai.chat,
  });

  const worker = createTaskWorker({
    pool,
    handlers: [handler as TaskHandler<unknown>],
    pollIntervalMs: 1000,
    concurrency: 1,
    ownsWork,
  });

  if (enabled) {
    void worker.run();
    app.log.info('Task worker started for candidate processing');
  } else {
    app.log.info('Task worker ownership registered without starting local processing');
  }

  // Store worker reference for graceful shutdown
  app.decorate('taskWorker', worker);
}
