/**
 * Bootstrap workers for compatibility-shell shared jobs.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { buildSharedJobHandlersContract } from '@trapmap/server/lib/jobs/index.js';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
import { createTaskWorker } from '@trapmap/server/lib/queue/task-worker.js';
import { type SkillShareerStore, getStorePool } from '@trapmap/server/lib/store.js';

export interface BootstrapWorkersOptions {
  enabled?: boolean;
  ownSharedJobTaskWork?: boolean;
}

function buildSharedJobWorkerHandlers(
  app: FastifyInstance,
  store: SkillShareerStore,
  pool: Pool,
): TaskHandler<unknown>[] {
  const contract = buildSharedJobHandlersContract({
    knowledgeIndexFollowUp: {
      store,
      registry: app.skillShareer.adapterRegistry,
      pool,
      graphQueryBackend: app.skillShareer.graphQueryBackend,
    },
    skillIndexFollowUp: {
      services: {
        store,
        ai: app.skillShareer.ai,
        graphQueryBackend: app.skillShareer.graphQueryBackend,
      },
      pool,
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
      pool,
    },
    badcaseExportDraft: {
      services: {
        store,
      },
      pool,
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
    ownSharedJobTaskWork = enabled,
  } = options;

  // Only runs when the store exposes PostgreSQL pool access (databaseUrl configured).
  const pool = getStorePool(store);
  if (!pool) return;

  const taskTransport = app.skillShareer.asyncTransport?.task;

  if (taskTransport?.kind === 'rabbitmq-task-queue' && taskTransport.createConsumer) {
    const consumer = await taskTransport.createConsumer({
      handlers: buildSharedJobWorkerHandlers(app, store, pool),
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
      key: 'sharedJobTaskWorker',
      label: 'shared-async-job',
      shouldOwn: ownSharedJobTaskWork,
      worker: createTaskWorker({
        pool,
        handlers: buildSharedJobWorkerHandlers(app, store, pool),
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
