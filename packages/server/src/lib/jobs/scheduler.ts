import type { PoolClient } from 'pg';

import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

import type { SharedJobTaskType } from './types.js';

export async function scheduleSharedJobTx<TPayload>(
  store: SkillShareerStore,
  client: PoolClient,
  type: SharedJobTaskType,
  payload: TPayload,
  dedupeKey: string,
): Promise<void> {
  if (!(store instanceof PostgresStore)) {
    return;
  }

  const queue = createTaskQueue({ pool: store.getPool() });
  await queue.enqueueTx(client, type, payload, { dedupeKey });
}

export async function scheduleSharedJob<TPayload>(
  store: SkillShareerStore,
  type: SharedJobTaskType,
  payload: TPayload,
  dedupeKey: string,
): Promise<void> {
  if (!(store instanceof PostgresStore)) {
    return;
  }

  const queue = createTaskQueue({ pool: store.getPool() });
  await queue.enqueue(type, payload, { dedupeKey });
}
