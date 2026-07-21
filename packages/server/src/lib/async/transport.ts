import type { PoolClient } from 'pg';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';

export interface AsyncTaskTransport {
  kind: 'postgres-task-queue' | 'rabbitmq-task-queue';
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
    provider: 'postgres' | 'rabbitmq';
    pending: number;
    running: number;
    dead: number;
    staleRunning: number;
    reclaimCount: number;
  }>;
  createConsumer?: (params: {
    handlers: TaskHandler<unknown>[];
    ownsWork: boolean;
  }) => Promise<{
    run(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    ownsWork(): boolean;
  }>;
}

export interface AsyncEventTransport {
  kind: 'postgres-domain-outbox';
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
    provider: 'postgres';
    pending: number;
    processing: number;
    failed: number;
    staleProcessing: number;
    reclaimCount: number;
  }>;
}

export interface AsyncTransport {
  task: AsyncTaskTransport;
  events: AsyncEventTransport;
}
