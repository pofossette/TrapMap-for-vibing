import { randomUUID } from 'node:crypto';

import type { QueuePorts, TaskHandler } from '@trapmap/backend-core';
import type { Pool, PoolClient } from 'pg';
import { createRabbitMqTaskTransport } from './rabbitmq-task-transport.js';

export interface JobRuntimeAsyncTransportConfig {
  provider: 'postgres' | 'rabbitmq';
  rabbitmq: { url: string; exchange: string; queue: string; prefetch: number } | null;
}

export interface JobRuntimeAsyncTransport extends QueuePorts {
  task: QueuePorts['task'] & {
    enqueueTx<T>(
      client: PoolClient,
      type: string,
      payload: T,
      options?: EnqueueOptions,
    ): Promise<unknown>;
  };
  events: QueuePorts['outbox'] & {
    enqueueTx(client: PoolClient, params: OutboxParams): Promise<unknown>;
  };
}

interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
  delayMs?: number;
  dedupeKey?: string;
}

interface OutboxParams {
  aggregateType: string;
  aggregateId: string;
  eventName: string;
  payload: unknown;
  delayMs?: number;
}

export function createJobRuntimeAsyncTransport(params: {
  config: { asyncTaskTransport: JobRuntimeAsyncTransportConfig };
  pool: Pool;
}): JobRuntimeAsyncTransport {
  if (params.config.asyncTaskTransport.provider === 'rabbitmq') {
    const rabbitmq = params.config.asyncTaskTransport.rabbitmq;
    if (!rabbitmq) {
      throw new Error('RabbitMQ task transport config is required');
    }
    const outbox = createPostgresOutbox(params.pool);
    return {
      task: createRabbitMqTaskTransport(rabbitmq),
      outbox,
      events: outbox,
    };
  }

  const outbox = createPostgresOutbox(params.pool);
  return {
    task: createPostgresTaskQueue(params.pool),
    outbox,
    events: outbox,
  };
}

function createPostgresTaskQueue(pool: Pool): JobRuntimeAsyncTransport['task'] {
  let reclaimCount = 0;
  const enqueueWith = async <T>(
    client: Pick<PoolClient, 'query'>,
    type: string,
    payload: T,
    options: EnqueueOptions = {},
  ) => {
    const id = `task_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const processAfter = new Date(Date.now() + (options.delayMs ?? 0));
    try {
      const result = await client.query<{ id: string }>(
        `INSERT INTO task_queue (id, type, payload, status, priority, attempts, max_attempts, dedupe_key, process_after, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, 0, $5, $6, $7, NOW(), NOW()) RETURNING id`,
        [
          id,
          type,
          JSON.stringify(payload),
          options.priority ?? 0,
          options.maxAttempts ?? 3,
          options.dedupeKey ?? null,
          processAfter,
        ],
      );
      return result.rows[0]?.id ?? id;
    } catch (error) {
      if (!(options.dedupeKey && isUniqueViolation(error))) throw error;
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM task_queue WHERE type = $1 AND dedupe_key = $2 AND status IN ('pending', 'running') ORDER BY created_at ASC LIMIT 1`,
        [type, options.dedupeKey],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      throw error;
    }
  };

  return {
    kind: 'postgres-task-queue',
    enqueue: (type, payload, options) => enqueueWith(pool, type, payload, options),
    enqueueTx: (client, type, payload, options) => enqueueWith(client, type, payload, options),
    async requeue(taskId) {
      await pool.query(
        `UPDATE task_queue SET status = 'pending', attempts = 0, last_error = NULL, process_after = NOW(), worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, updated_at = NOW() WHERE id = $1 AND status = 'dead'`,
        [taskId],
      );
    },
    async getStatusSnapshot() {
      const result = await pool.query<{
        pending: string;
        running: string;
        dead: string;
        stale_running: string;
      }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'running') AS running, COUNT(*) FILTER (WHERE status = 'dead') AS dead, COUNT(*) FILTER (WHERE status = 'running' AND lease_until < NOW()) AS stale_running FROM task_queue`,
      );
      const row = result.rows[0];
      return {
        provider: 'postgres' as const,
        pending: Number(row?.pending ?? 0),
        running: Number(row?.running ?? 0),
        dead: Number(row?.dead ?? 0),
        staleRunning: Number(row?.stale_running ?? 0),
        reclaimCount,
      };
    },
    async createConsumer({ handlers, ownsWork }) {
      let running = false;
      const workerId = `job-runtime_${process.pid}_${randomUUID().slice(0, 8)}`;
      const reclaim = async () => {
        const result = await pool.query(
          `UPDATE task_queue SET status = 'pending', worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, process_after = NOW(), updated_at = NOW() WHERE status = 'running' AND lease_until < NOW()`,
        );
        reclaimCount += result.rowCount ?? 0;
      };
      const consume = async (handler: TaskHandler<unknown>) => {
        await reclaim();
        const claimed = await pool.query<{
          id: string;
          type: string;
          payload: unknown;
          attempts: number;
        }>(
          `UPDATE task_queue SET status = 'running', attempts = attempts + 1, worker_id = $2, started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), lease_until = NOW() + INTERVAL '30 seconds', updated_at = NOW() WHERE id = (SELECT id FROM task_queue WHERE type = $1 AND status = 'pending' AND process_after <= NOW() ORDER BY priority DESC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, type, payload, attempts`,
          [handler.type, workerId],
        );
        const task = claimed.rows[0];
        if (!task) return;
        try {
          await handler.handle(
            { id: task.id, type: task.type, payload: task.payload, attempt: task.attempts },
            new AbortController().signal,
          );
          await pool.query(
            `UPDATE task_queue SET status = 'completed', completed_at = NOW(), worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, updated_at = NOW() WHERE id = $1`,
            [task.id],
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const failed = await pool.query<{ attempts: number; max_attempts: number }>(
            'SELECT attempts, max_attempts FROM task_queue WHERE id = $1',
            [task.id],
          );
          const row = failed.rows[0];
          const dead = !row || row.attempts >= row.max_attempts;
          await pool.query(
            dead
              ? `UPDATE task_queue SET status = 'dead', last_error = $2, worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, updated_at = NOW() WHERE id = $1`
              : `UPDATE task_queue SET status = 'pending', last_error = $2, worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, process_after = NOW() + (5000 * POWER(2, attempts - 1)) * INTERVAL '1 millisecond', updated_at = NOW() WHERE id = $1`,
            [task.id, message],
          );
          if (dead) await handler.onDead?.({ id: task.id, type: task.type, payload: task.payload });
        }
      };
      let loop: Promise<void> | null = null;
      return {
        async run() {
          if (running || !ownsWork) return;
          running = true;
          loop = (async () => {
            while (running) {
              await Promise.all(handlers.map(consume));
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          })();
        },
        async stop() {
          running = false;
          await loop;
        },
        isRunning: () => running,
        ownsWork: () => ownsWork,
      };
    },
  };
}

function createPostgresOutbox(pool: Pool): JobRuntimeAsyncTransport['events'] {
  let reclaimCount = 0;
  const enqueueWith = async (client: Pick<PoolClient, 'query'>, params: OutboxParams) => {
    const id = `evt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await client.query(
      `INSERT INTO domain_event_outbox (id, aggregate_type, aggregate_id, event_name, payload, status, available_at, attempts, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, 0, NOW())`,
      [
        id,
        params.aggregateType,
        params.aggregateId,
        params.eventName,
        JSON.stringify(params.payload),
        new Date(Date.now() + (params.delayMs ?? 0)),
      ],
    );
    return id;
  };
  return {
    kind: 'postgres-domain-outbox',
    enqueue: (params) => enqueueWith(pool, params),
    enqueueTx: (client, params) => enqueueWith(client, params),
    async claimBatch(limit = 10, workerId = `job-runtime-outbox_${process.pid}`) {
      const reclaimed = await pool.query(
        `UPDATE domain_event_outbox SET status = 'pending', worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, available_at = NOW() WHERE status = 'processing' AND lease_until < NOW()`,
      );
      reclaimCount += reclaimed.rowCount ?? 0;
      const result = await pool.query<{
        id: string;
        eventName: string;
        payload: unknown;
        aggregateId: string;
      }>(
        `UPDATE domain_event_outbox SET status = 'processing', attempts = attempts + 1, worker_id = $2, started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), lease_until = NOW() + INTERVAL '30 seconds' WHERE id IN (SELECT id FROM domain_event_outbox WHERE status = 'pending' AND available_at <= NOW() ORDER BY event_name, created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING id, event_name AS "eventName", payload, aggregate_id AS "aggregateId"`,
        [limit, workerId],
      );
      return result.rows;
    },
    async complete(eventId) {
      await pool.query(
        `UPDATE domain_event_outbox SET status = 'completed', published_at = NOW(), worker_id = NULL, heartbeat_at = NULL, lease_until = NULL WHERE id = $1`,
        [eventId],
      );
    },
    async fail(eventId, error) {
      await pool.query(
        `UPDATE domain_event_outbox SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, last_error = $2, worker_id = NULL, heartbeat_at = NULL, lease_until = NULL, available_at = CASE WHEN attempts >= 3 THEN available_at ELSE NOW() + (5000 * POWER(2, attempts - 1)) * INTERVAL '1 millisecond' END WHERE id = $1`,
        [eventId, error],
      );
    },
    async getStatusSnapshot() {
      const result = await pool.query<{
        pending: string;
        processing: string;
        failed: string;
        stale_processing: string;
      }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'processing') AS processing, COUNT(*) FILTER (WHERE status = 'failed') AS failed, COUNT(*) FILTER (WHERE status = 'processing' AND lease_until < NOW()) AS stale_processing FROM domain_event_outbox`,
      );
      const row = result.rows[0];
      return {
        provider: 'postgres' as const,
        pending: Number(row?.pending ?? 0),
        processing: Number(row?.processing ?? 0),
        failed: Number(row?.failed ?? 0),
        staleProcessing: Number(row?.stale_processing ?? 0),
        reclaimCount,
      };
    },
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
