/**
 * Domain Event Outbox — durable async event processing.
 *
 * Events are enqueued during write-path transactions and processed
 * asynchronously by a background worker. This separates the HTTP request
 * lifecycle from heavy side effects (indexing, conflict detection).
 *
 * Uses PostgreSQL SKIP LOCKED for safe concurrent processing.
 *
 * Phase: Round 10 Phase 2 (Lifecycle Outbox)
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

import { domainEventOutbox } from '@trapmap/server/lib/persistence/schema.js';
import { recordRuntimeExecution, recordRuntimeReclaim } from '@trapmap/server/lib/runtime/metrics.js';
import type { DomainEvent } from './types.js';

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventName: string;
  payload: DomainEvent;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  availableAt: Date;
  attempts: number;
  lastError: string | null;
  workerId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  createdAt: Date;
  publishedAt: Date | null;
}

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_name: string;
  payload: DomainEvent;
  status: string;
  available_at: Date;
  attempts: number;
  last_error: string | null;
  worker_id: string | null;
  started_at: Date | null;
  heartbeat_at: Date | null;
  lease_until: Date | null;
  created_at: Date;
  published_at: Date | null;
}

function rowToOutboxEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventName: row.event_name,
    payload: row.payload,
    status: row.status as OutboxEvent['status'],
    availableAt: row.available_at,
    attempts: row.attempts,
    lastError: row.last_error,
    workerId: row.worker_id,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    leaseUntil: row.lease_until,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export interface DomainEventOutboxConfig {
  pool: Pool;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  leaseDurationMs?: number;
}

export interface OutboxStatusSnapshot {
  pending: number;
  processing: number;
  failed: number;
  staleProcessing: number;
  backlogOldestAgeSeconds: number | null;
  processingOldestAgeSeconds: number | null;
  failedOldestAgeSeconds: number | null;
  reclaimCount: number;
  recentFailures: OutboxEvent[];
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 5000;
const DEFAULT_MAX_RETRY_DELAY_MS = 300000;
const DEFAULT_LEASE_DURATION_MS = 30_000;

export function createDomainEventOutbox(config: DomainEventOutboxConfig) {
  const {
    pool,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseRetryDelayMs = DEFAULT_BASE_RETRY_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
    leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  } = config;

  const db = drizzle(pool, { schema: { domainEventOutbox } });
  let reclaimCount = 0;

  /**
   * Enqueue a domain event for async processing.
   * Called from write-path routes after the transaction commits.
   */
  async function enqueueViaClient(
    client: Pick<PoolClient, 'query'>,
    params: {
      aggregateType: string;
      aggregateId: string;
      eventName: string;
      payload: DomainEvent;
      delayMs?: number;
    },
  ): Promise<OutboxEvent> {
    const id = `evt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const availableAt = params.delayMs ? new Date(Date.now() + params.delayMs) : new Date();

    await client.query(
      `
      INSERT INTO domain_event_outbox (
        id, aggregate_type, aggregate_id, event_name, payload, status, available_at,
        attempts, last_error, worker_id, started_at, heartbeat_at, lease_until, created_at, published_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, 'pending', $6, 0, NULL, NULL, NULL, NULL, NULL, NOW(), NULL
      )
      `,
      [
        id,
        params.aggregateType,
        params.aggregateId,
        params.eventName,
        JSON.stringify(params.payload),
        availableAt,
      ],
    );

    return {
      id,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventName: params.eventName,
      payload: params.payload,
      status: 'pending',
      availableAt,
      attempts: 0,
      lastError: null,
      workerId: null,
      startedAt: null,
      heartbeatAt: null,
      leaseUntil: null,
      createdAt: new Date(),
      publishedAt: null,
    };
  }

  async function enqueue(params: {
    aggregateType: string;
    aggregateId: string;
    eventName: string;
    payload: DomainEvent;
    delayMs?: number;
  }): Promise<OutboxEvent> {
    return enqueueViaClient(pool, params);
  }

  /**
   * Claim a batch of pending events for processing (SKIP LOCKED).
   * Returns up to `limit` events, ordered by available_at then created_at.
   */
  async function claimBatch(limit = 10, workerId = `outbox_${process.pid}`): Promise<OutboxEvent[]> {
    await reclaimExpiredLeases();

    const result = await pool.query<OutboxRow>(
      `
      UPDATE domain_event_outbox
      SET status = 'processing',
          attempts = attempts + 1,
          worker_id = $3,
          started_at = COALESCE(started_at, NOW()),
          heartbeat_at = NOW(),
          lease_until = NOW() + ($4 * INTERVAL '1 millisecond')
      WHERE id IN (
        SELECT id FROM domain_event_outbox
        WHERE status = 'pending'
          AND available_at <= NOW()
          AND attempts < $1
        ORDER BY event_name, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
      `,
      [maxAttempts, limit, workerId, leaseDurationMs],
    );

    return result.rows.map(rowToOutboxEvent);
  }

  /**
   * Mark an event as completed.
   */
  async function complete(eventId: string): Promise<void> {
    await db
      .update(domainEventOutbox)
      .set({
        status: 'completed',
        publishedAt: new Date(),
        workerId: null,
        startedAt: null,
        heartbeatAt: null,
        leaseUntil: null,
      })
      .where(eq(domainEventOutbox.id, eventId));
  }

  /**
   * Mark an event as failed, optionally with an error message.
   * The event will be retried on the next claimBatch if attempts < maxAttempts.
   */
  async function fail(eventId: string, error: string): Promise<void> {
    const result = await pool.query<Pick<OutboxRow, 'attempts'>>(
      'SELECT attempts FROM domain_event_outbox WHERE id = $1',
      [eventId],
    );

    const row = result.rows[0];
    if (!row) return;

    const newAttempts = row.attempts + 1;
    const isDead = newAttempts >= maxAttempts;

    // When dead, keep status as 'failed' to stop further retries.
    // When retryable, reset to 'pending' but increment attempts.
    if (isDead) {
      recordRuntimeExecution({
        dependencyName: 'domain-event-outbox',
        failureKind: 'permanent',
      });
      await db
        .update(domainEventOutbox)
        .set({
          status: 'failed',
          attempts: newAttempts,
          lastError: error,
          workerId: null,
          heartbeatAt: null,
          leaseUntil: null,
        })
        .where(eq(domainEventOutbox.id, eventId));
    } else {
      // Back-off: available_at = now + delay based on attempts
      const backoffMs = Math.min(baseRetryDelayMs * 2 ** (newAttempts - 1), maxRetryDelayMs);
      recordRuntimeExecution({
        dependencyName: 'domain-event-outbox',
        failureKind: 'retryable',
      });
      const nextAvailable = new Date(Date.now() + backoffMs);

      await db
        .update(domainEventOutbox)
        .set({
          status: 'pending',
          attempts: newAttempts,
          lastError: error,
          availableAt: nextAvailable,
          workerId: null,
          heartbeatAt: null,
          leaseUntil: null,
        })
        .where(eq(domainEventOutbox.id, eventId));
    }
  }

  async function heartbeat(eventId: string, workerId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE domain_event_outbox
      SET heartbeat_at = NOW(),
          lease_until = NOW() + ($3 * INTERVAL '1 millisecond')
      WHERE id = $1
        AND worker_id = $2
        AND status = 'processing'
      `,
      [eventId, workerId, leaseDurationMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async function reclaimExpiredLeases(): Promise<number> {
    const result = await pool.query(
      `
      UPDATE domain_event_outbox
      SET status = 'pending',
          worker_id = NULL,
          heartbeat_at = NULL,
          lease_until = NULL,
          available_at = NOW()
      WHERE status = 'processing'
        AND lease_until IS NOT NULL
        AND lease_until < NOW()
      `,
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      reclaimCount += count;
      recordRuntimeReclaim('domain-event-outbox', count);
    }
    return count;
  }

  async function getStatusSnapshot(limit = 10): Promise<OutboxStatusSnapshot> {
    const summaryResult = await pool.query<{
      pending: string;
      processing: string;
      failed: string;
      stale_processing: string;
      backlog_oldest_age_seconds: string | null;
      processing_oldest_age_seconds: string | null;
      failed_oldest_age_seconds: string | null;
    }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'processing' AND lease_until IS NOT NULL AND lease_until < NOW()) AS stale_processing,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))) FILTER (WHERE status = 'pending')::text AS backlog_oldest_age_seconds,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)))) FILTER (WHERE status = 'processing' AND started_at IS NOT NULL)::text AS processing_oldest_age_seconds,
        MAX(FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))) FILTER (WHERE status = 'failed')::text AS failed_oldest_age_seconds
      FROM domain_event_outbox
      `,
    );

    const failures = await pool.query<OutboxRow>(
      `
      SELECT *
      FROM domain_event_outbox
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit],
    );

    const summary = summaryResult.rows[0];
    return {
      pending: Number(summary?.pending ?? 0),
      processing: Number(summary?.processing ?? 0),
      failed: Number(summary?.failed ?? 0),
      staleProcessing: Number(summary?.stale_processing ?? 0),
      backlogOldestAgeSeconds: parseNullableInt(summary?.backlog_oldest_age_seconds),
      processingOldestAgeSeconds: parseNullableInt(summary?.processing_oldest_age_seconds),
      failedOldestAgeSeconds: parseNullableInt(summary?.failed_oldest_age_seconds),
      reclaimCount,
      recentFailures: failures.rows.map(rowToOutboxEvent),
    };
  }

  /**
   * Get count of pending events (for monitoring).
   */
  async function getPendingCount(): Promise<number> {
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*) FROM domain_event_outbox WHERE status = 'pending'",
    );
    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Clean up completed events older than retention period.
   */
  async function cleanup(retentionDays = 7): Promise<number> {
    const result = await pool.query(
      `DELETE FROM domain_event_outbox
       WHERE status = 'completed'
         AND published_at < NOW() - INTERVAL '${retentionDays} days'
       RETURNING id`,
    );
    return result.rowCount ?? 0;
  }

  return {
    enqueue,
    enqueueTx: enqueueViaClient,
    claimBatch,
    complete,
    fail,
    heartbeat,
    reclaimExpiredLeases,
    getStatusSnapshot,
    getPendingCount,
    cleanup,
    policy: {
      maxAttempts,
      baseRetryDelayMs,
      maxRetryDelayMs,
    },
  };
}

function parseNullableInt(value: string | null | undefined): number | null {
  if (value == null) return null;
  return Number.parseInt(value, 10);
}
