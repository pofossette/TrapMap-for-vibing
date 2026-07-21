/**
 * Bootstrap workers for compatibility-shell shared jobs.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { buildSharedJobHandlersContract } from '@trapmap/server/lib/jobs/index.js';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
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
  });

  return [contract.knowledgeIndexFollowUp, contract.skillIndexFollowUp];
}

export async function bootstrapWorkers(
  app: FastifyInstance,
  options: BootstrapWorkersOptions = {},
): Promise<void> {
  const store = app.skillShareer.store;
  const { enabled = true, ownSharedJobTaskWork = enabled } = options;

  // Only runs when the store exposes PostgreSQL pool access (databaseUrl configured).
  const pool = getStorePool(store);
  if (!pool) return;

  const taskTransport = app.skillShareer.asyncTransport?.task;

  if (taskTransport?.createConsumer) {
    const consumer = await taskTransport.createConsumer({
      handlers: buildSharedJobWorkerHandlers(app, store, pool),
      ownsWork: ownSharedJobTaskWork,
    });

    if (enabled && ownSharedJobTaskWork) {
      void consumer.run();
      app.log.info({ worker: 'job-runtime-task-consumer' }, 'Task worker started');
    } else {
      app.log.info(
        { worker: 'job-runtime-task-consumer' },
        'Task worker ownership registered without starting local processing',
      );
    }

    app.decorate('taskWorker', consumer);
    return;
  }

  throw new Error('server worker bootstrap requires an injected job-runtime task consumer');
}
