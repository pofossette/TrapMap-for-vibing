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
import type { Pool } from 'pg';

import { domainEventOutbox } from '@trapmap/server/lib/persistence/schema.js';
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
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export interface DomainEventOutboxConfig {
  pool: Pool;
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;

export function createDomainEventOutbox(config: DomainEventOutboxConfig) {
  const { pool, maxAttempts = DEFAULT_MAX_ATTEMPTS } = config;

  const db = drizzle(pool, { schema: { domainEventOutbox } });

  /**
   * Enqueue a domain event for async processing.
   * Called from write-path routes after the transaction commits.
   */
  async function enqueue(params: {
    aggregateType: string;
    aggregateId: string;
    eventName: string;
    payload: DomainEvent;
    delayMs?: number;
  }): Promise<OutboxEvent> {
    const id = `evt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const availableAt = params.delayMs ? new Date(Date.now() + params.delayMs) : new Date();

    await db.insert(domainEventOutbox).values({
      id,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventName: params.eventName,
      payload: params.payload as unknown as Record<string, unknown>,
      status: 'pending',
      availableAt,
    });

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
      createdAt: new Date(),
      publishedAt: null,
    };
  }

  /**
   * Claim a batch of pending events for processing (SKIP LOCKED).
   * Returns up to `limit` events, ordered by available_at then created_at.
   */
  async function claimBatch(limit = 10): Promise<OutboxEvent[]> {
    const result = await pool.query<OutboxRow>(
      `
      UPDATE domain_event_outbox
      SET status = 'processing', attempts = attempts + 1
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
      [maxAttempts, limit],
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
      await db
        .update(domainEventOutbox)
        .set({
          status: 'failed',
          attempts: newAttempts,
          lastError: error,
        })
        .where(eq(domainEventOutbox.id, eventId));
    } else {
      // Back-off: available_at = now + delay based on attempts
      const backoffMs = Math.min(5000 * 2 ** (newAttempts - 1), 300000);
      const nextAvailable = new Date(Date.now() + backoffMs);

      await db
        .update(domainEventOutbox)
        .set({
          status: 'pending',
          attempts: newAttempts,
          lastError: error,
          availableAt: nextAvailable,
        })
        .where(eq(domainEventOutbox.id, eventId));
    }
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
    claimBatch,
    complete,
    fail,
    getPendingCount,
    cleanup,
  };
}
