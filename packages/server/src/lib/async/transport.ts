import type { Pool, PoolClient } from 'pg';

import { createDomainEventOutbox } from '@trapmap/server/lib/lifecycle/outbox.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';

export interface AsyncQueueTransport {
  enqueue<T>(
    type: string,
    payload: T,
    options?: {
      priority?: number;
      maxAttempts?: number;
      delayMs?: number;
      dedupeKey?: string;
    },
  ): Promise<unknown>;
  enqueueTx<T>(
    client: PoolClient,
    type: string,
    payload: T,
    options?: {
      priority?: number;
      maxAttempts?: number;
      delayMs?: number;
      dedupeKey?: string;
    },
  ): Promise<unknown>;
  requeue(taskId: string): Promise<void>;
  getStatusSnapshot(): Promise<{
    pending: number;
    running: number;
    dead: number;
    staleRunning: number;
    reclaimCount: number;
  }>;
}

export interface AsyncEventTransport {
  enqueue(params: {
    aggregateType: string;
    aggregateId: string;
    eventName: string;
    payload: unknown;
    delayMs?: number;
  }): Promise<unknown>;
  enqueueTx(
    client: PoolClient,
    params: {
      aggregateType: string;
      aggregateId: string;
      eventName: string;
      payload: unknown;
      delayMs?: number;
    },
  ): Promise<unknown>;
  claimBatch(
    limit?: number,
    workerId?: string,
  ): Promise<Array<{ id: string; eventName: string; payload: unknown; aggregateId: string }>>;
  complete(eventId: string): Promise<void>;
  fail(eventId: string, error: string): Promise<void>;
  getStatusSnapshot(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    staleProcessing: number;
    reclaimCount: number;
  }>;
}

export interface AsyncTransport {
  kind: 'postgres-outbox-task-queue';
  queue: AsyncQueueTransport;
  events: AsyncEventTransport;
}

export function createPostgresAsyncTransport(pool: Pool): AsyncTransport {
  const queue = createTaskQueue({ pool });
  const events = createDomainEventOutbox({ pool });

  return {
    kind: 'postgres-outbox-task-queue',
    queue: {
      enqueue: queue.enqueue,
      enqueueTx: queue.enqueueTx,
      requeue: queue.requeue,
      getStatusSnapshot: queue.getStatusSnapshot,
    },
    events: {
      enqueue: events.enqueue,
      enqueueTx: events.enqueueTx,
      claimBatch: events.claimBatch,
      complete: events.complete,
      fail: events.fail,
      getStatusSnapshot: events.getStatusSnapshot,
    },
  };
}
