/**
 * Bootstrap workers — create and start the task worker for candidate processing.
 *
 * Runs AFTER repositories are initialized so that repos.candidate is available
 * for the candidate processing handler.
 */

import type { FastifyInstance } from 'fastify';

import { createCandidateProcessingHandler } from '@trapmap/server/lib/candidates/index.js';
import { buildSharedJobHandlersContract } from '@trapmap/server/lib/jobs/index.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { type TaskHandler, createTaskWorker } from '@trapmap/server/lib/queue/task-queue.js';

export interface BootstrapWorkersOptions {
  enabled?: boolean;
  ownCandidateTaskWork?: boolean;
  ownSharedJobTaskWork?: boolean;
}

function buildSharedJobWorkerHandlers(
  app: FastifyInstance,
  store: PostgresStore,
): TaskHandler<unknown>[] {
  const contract = buildSharedJobHandlersContract({
    knowledgeIndexFollowUp: {
      store,
      registry: app.skillShareer.adapterRegistry,
      pool: store.getPool(),
      graphQueryBackend: app.skillShareer.graphQueryBackend,
    },
    skillIndexFollowUp: {
      services: {
        store,
        ai: app.skillShareer.ai,
        graphQueryBackend: app.skillShareer.graphQueryBackend,
      },
      pool: store.getPool(),
    },
    remediationReactivation: {
      services: {
        store,
        repos: {
          knowledge: app.skillShareer.repos.knowledge,
          artifact: app.skillShareer.repos.artifact,
        },
        adapterRegistry: app.skillShareer.adapterRegistry,
        ai: app.skillShareer.ai,
        graphQueryBackend: app.skillShareer.graphQueryBackend,
      },
      pool: store.getPool(),
    },
    badcaseExportDraft: {
      services: {
        store,
      },
      pool: store.getPool(),
    },
  });

  return [
    contract.knowledgeIndexFollowUp,
    contract.skillIndexFollowUp,
    contract.remediationReactivation,
    contract.badcaseExportDraft,
  ];
}

export async function bootstrapWorkers(
  app: FastifyInstance,
  options: BootstrapWorkersOptions = {},
): Promise<void> {
  const store = app.skillShareer.store;
  const {
    enabled = true,
    ownCandidateTaskWork = enabled,
    ownSharedJobTaskWork = enabled,
  } = options;

  // Only runs when using PostgresStore (databaseUrl configured)
  if (!(store instanceof PostgresStore)) return;

  const pool = store.getPool();
  const taskTransport = app.skillShareer.asyncTransport?.task;

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

  if (taskTransport?.kind === 'rabbitmq-task-queue' && taskTransport.createConsumer) {
    const consumer = await taskTransport.createConsumer({
      handlers: [handler as TaskHandler<unknown>, ...buildSharedJobWorkerHandlers(app, store)],
      ownsWork: enabled,
    });

    if (enabled) {
      void consumer.run();
      app.log.info({ worker: 'rabbitmq-task-consumer' }, 'Task worker started');
    } else {
      app.log.info(
        { worker: 'rabbitmq-task-consumer' },
        'Task worker ownership registered without starting local processing',
      );
    }

    app.decorate('taskWorker', consumer);
    return;
  }

  const taskWorkers = [
    {
      key: 'candidateTaskWorker',
      label: 'candidate',
      shouldOwn: ownCandidateTaskWork,
      worker: createTaskWorker({
        pool,
        handlers: [handler as TaskHandler<unknown>],
        pollIntervalMs: 1000,
        concurrency: 1,
        ownsWork: ownCandidateTaskWork,
      }),
    },
    {
      key: 'sharedJobTaskWorker',
      label: 'shared-async-job',
      shouldOwn: ownSharedJobTaskWork,
      worker: createTaskWorker({
        pool,
        handlers: buildSharedJobWorkerHandlers(app, store),
        pollIntervalMs: 1000,
        concurrency: 1,
        ownsWork: ownSharedJobTaskWork,
      }),
    },
  ] as const;

  for (const entry of taskWorkers) {
    if (enabled && entry.shouldOwn) {
      void entry.worker.run();
      app.log.info({ worker: entry.label }, 'Task worker started');
    } else {
      app.log.info(
        { worker: entry.label },
        'Task worker ownership registered without starting local processing',
      );
    }
  }

  // Store worker reference for graceful shutdown
  app.decorate('taskWorker', {
    isRunning: () => taskWorkers.some((entry) => entry.worker.isRunning()),
    ownsWork: () => taskWorkers.some((entry) => entry.worker.ownsWork()),
    stop: async () => {
      await Promise.all(taskWorkers.map((entry) => entry.worker.stop()));
    },
  });
}
