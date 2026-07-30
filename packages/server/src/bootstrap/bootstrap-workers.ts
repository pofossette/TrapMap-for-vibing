/**
 * Bootstrap workers for compatibility-shell shared jobs.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { buildSharedJobHandlersContract } from '@trapmap/server/lib/jobs/index.js';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';

export interface BootstrapWorkersOptions {
  enabled?: boolean;
  ownSharedJobTaskWork?: boolean;
}

function buildSharedJobWorkerHandlers(app: FastifyInstance, pool: Pool): TaskHandler<unknown>[] {
  const contract = buildSharedJobHandlersContract({
    knowledgeIndexFollowUp: {
      pool,
      registry: app.skillShareer.adapterRegistry,
      ...(app.skillShareer.graphQueryBackend !== undefined
        ? { graphQueryBackend: app.skillShareer.graphQueryBackend }
        : {}),
      graphIndex: app.skillShareer.graphIndex,
      knowledgeOwner: app.skillShareer.knowledgeOwner,
    },
    skillIndexFollowUp: {
      services: {
        pool,
        ai: app.skillShareer.ai,
        ...(app.skillShareer.graphQueryBackend !== undefined
          ? { graphQueryBackend: app.skillShareer.graphQueryBackend }
          : {}),
        graphIndex: app.skillShareer.graphIndex,
        artifactReadProjection: app.skillShareer.artifactReadProjection,
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
  const { enabled = true, ownSharedJobTaskWork = enabled } = options;

  const pool = app.skillShareer.pool;
  if (!pool) return;

  const taskTransport = app.skillShareer.asyncTransport?.task;

  if (taskTransport?.createConsumer) {
    const consumer = await taskTransport.createConsumer({
      handlers: buildSharedJobWorkerHandlers(app, pool),
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
