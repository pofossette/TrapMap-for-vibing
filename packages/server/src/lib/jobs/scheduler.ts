import type { PoolClient } from 'pg';

import type { AsyncTaskTransport } from '@trapmap/server/lib/async/transport.js';
import { getStorePool, type SkillShareerStore } from '@trapmap/server/lib/store.js';

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
  store: SkillShareerStore,
  client: PoolClient,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!getStorePool(store) || !queue) {
    return;
  }

  await queue.enqueueTx(client, type, payload, dedupeKey);
}

export async function scheduleSharedJob<TTaskType extends SharedJobTaskType>(
  queue: SharedJobQueuePort | undefined,
  store: SkillShareerStore,
  type: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
  dedupeKey: string,
): Promise<void> {
  if (!getStorePool(store) || !queue) {
    return;
  }

  await queue.enqueue(type, payload, dedupeKey);
}
