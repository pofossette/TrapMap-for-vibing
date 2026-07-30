import type { Pool, PoolClient } from 'pg';

import type { AsyncTaskTransport } from '@trapmap/server/lib/async/transport.js';

import {
  type SharedJobPayloadByType,
  type SharedJobTaskType,
  getSharedJobContract,
} from './types.js';

export interface SharedJobQueuePort {
  enqueue<TTaskType extends SharedJobTaskType>(
    type: TTaskType,
    payload: SharedJobPayloadByType[TTaskType],
    dedupeKey: string,
  ): Promise<void>;
  enqueueTx<TTaskType extends SharedJobTaskType>(
    client: PoolClient,
    type: TTaskType,
    payload: SharedJobPayloadByType[TTaskType],
    dedupeKey: string,
  ): Promise<void>;
}

export function createSharedJobQueuePort(queue: AsyncTaskTransport): SharedJobQueuePort {
  return {
    async enqueue(type, payload, dedupeKey) {
      const contract = getSharedJobContract(type);
      await queue.enqueue(type, payload, {
        dedupeKey,
        maxAttempts: contract.maxAttempts,
      });
    },
    async enqueueTx(client, type, payload, dedupeKey) {
      const contract = getSharedJobContract(type);
      await queue.enqueueTx(client, type, payload, {
        dedupeKey,
        maxAttempts: contract.maxAttempts,
      });
    },
  };
}

export async function scheduleSharedJobTx<TTaskType extends SharedJobTaskType>(
  queue: SharedJobQueuePort | undefined,
  pool: Pool | null,
  client: PoolClient,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!pool || !queue) {
    return;
  }

  await queue.enqueueTx(client, type, payload, dedupeKey);
}

export async function scheduleSharedJob<TTaskType extends SharedJobTaskType>(
  queue: SharedJobQueuePort | undefined,
  pool: Pool | null,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!pool || !queue) {
    return;
  }

  await queue.enqueue(type, payload, dedupeKey);
}
