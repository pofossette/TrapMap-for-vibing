import type { PoolClient } from 'pg';

import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

import {
  type SharedJobPayloadByType,
  type SharedJobTaskType,
  getSharedJobContract,
} from './types.js';

export async function scheduleSharedJobTx<TTaskType extends SharedJobTaskType>(
  store: SkillShareerStore,
  client: PoolClient,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!(store instanceof PostgresStore)) {
    return;
  }

  const queue = createTaskQueue({ pool: store.getPool() });
  const contract = getSharedJobContract(type);
  await queue.enqueueTx(client, type, payload, {
    dedupeKey,
    maxAttempts: contract.maxAttempts,
  });
}

export async function scheduleSharedJob<TTaskType extends SharedJobTaskType>(
  store: SkillShareerStore,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!(store instanceof PostgresStore)) {
    return;
  }

  const queue = createTaskQueue({ pool: store.getPool() });
  const contract = getSharedJobContract(type);
  await queue.enqueue(type, payload, {
    dedupeKey,
    maxAttempts: contract.maxAttempts,
  });
}
