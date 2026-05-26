/**
 * Tests for DomainEventOutbox.
 *
 * Covers:
 * - enqueue event
 * - claimBatch with SKIP LOCKED semantics
 * - complete event
 * - fail with retry and dead letter
 * - getPendingCount
 *
 * Phase: Round 10 Phase 2 (Lifecycle Outbox)
 */

import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDomainEventOutbox } from './outbox.js';
import type { DomainEvent } from './types.js';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new PgPool({ connectionString: DATABASE_URL });
  return pool;
}

afterAll(async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
});

function makeEvent(overrides?: Partial<DomainEvent>): DomainEvent {
  return {
    name: 'knowledge.approved',
    entryId: 'entry-test-1',
    previousState: 'agent-pass',
    nextState: 'approved',
    actorId: 'user-1',
    reason: 'test-approval',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describeIfDb('DomainEventOutbox', () => {
  let dbPool: Pool;

  beforeAll(async () => {
    dbPool = (await getPool())!;
  });

  it('should enqueue an event', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool });
    const event = makeEvent();

    const enqueued = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: event.entryId,
      eventName: event.name,
      payload: event,
    });

    expect(enqueued.id).toMatch(/^evt_/);
    expect(enqueued.status).toBe('pending');
    expect(enqueued.eventName).toBe('knowledge.approved');
    expect(enqueued.payload.entryId).toBe('entry-test-1');

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = $1', [enqueued.id]);
  });

  it('should claim pending events with SKIP LOCKED', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool });

    // Enqueue two events
    const e1 = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-a',
      eventName: 'knowledge.approved',
      payload: makeEvent({ entryId: 'entry-a' }),
    });
    const e2 = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-b',
      eventName: 'knowledge.deactivated',
      payload: makeEvent({ name: 'knowledge.deactivated', entryId: 'entry-b', nextState: 'deactivated' }),
    });

    // Claim batch
    const claimed = await outbox.claimBatch(10);

    // Both should be claimed
    expect(claimed.length).toBeGreaterThanOrEqual(2);
    const claimedIds = claimed.map((c) => c.id);
    expect(claimedIds).toContain(e1.id);
    expect(claimedIds).toContain(e2.id);

    // Mark as complete
    for (const c of claimed) {
      await outbox.complete(c.id);
    }

    // Verify no more pending
    const pending = await outbox.getPendingCount();
    expect(pending).toBe(0);

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = ANY($1)', [[e1.id, e2.id]]);
  });

  it('should not claim events that are already processing', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool });

    const event = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-c',
      eventName: 'knowledge.approved',
      payload: makeEvent({ entryId: 'entry-c' }),
    });

    // First claim
    const firstClaim = await outbox.claimBatch(10);
    expect(firstClaim.length).toBeGreaterThanOrEqual(1);
    expect(firstClaim.some((c) => c.id === event.id)).toBe(true);

    // Second claim should not include the same event (status is now 'processing')
    const secondClaim = await outbox.claimBatch(10);
    expect(secondClaim.some((c) => c.id === event.id)).toBe(false);

    // Complete the event
    await outbox.complete(event.id);

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = $1', [event.id]);
  });

  it('should retry on failure and eventually mark as failed', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool, maxAttempts: 3 });

    const event = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-d',
      eventName: 'knowledge.approved',
      payload: makeEvent({ entryId: 'entry-d' }),
    });

    // Fail 3 times (max attempts)
    for (let i = 0; i < 3; i++) {
      const claimed = await outbox.claimBatch(10);
      const claimedEvent = claimed.find((c) => c.id === event.id);
      if (claimedEvent) {
        await outbox.fail(claimedEvent.id, `error attempt ${i + 1}`);
      } else if (i < 3) {
        // Might need to wait for backoff: set available_at to now
        await dbPool.query(
          'UPDATE domain_event_outbox SET available_at = NOW() WHERE id = $1 AND status = $2',
          [event.id, 'pending'],
        );
      }
    }

    // After 3 failures, it should not be claimable
    const claimed = await outbox.claimBatch(10);
    const claimedEvent = claimed.find((c) => c.id === event.id);
    expect(claimedEvent).toBeUndefined();

    // Verify status is 'failed'
    const result = await dbPool.query(
      'SELECT status, attempts, last_error FROM domain_event_outbox WHERE id = $1',
      [event.id],
    );
    const row = result.rows[0];
    expect(row?.status).toBe('failed');
    expect(row?.attempts).toBeGreaterThanOrEqual(3);
    expect(row?.last_error).toBeTruthy();

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = $1', [event.id]);
  });

  it('should return pending count', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool });

    const e1 = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-e',
      eventName: 'knowledge.approved',
      payload: makeEvent({ entryId: 'entry-e' }),
    });
    const e2 = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: 'entry-f',
      eventName: 'knowledge.deactivated',
      payload: makeEvent({ name: 'knowledge.deactivated', entryId: 'entry-f', nextState: 'deactivated' }),
    });

    const pending = await outbox.getPendingCount();
    expect(pending).toBeGreaterThanOrEqual(2);

    // Claim and complete
    const claimed = await outbox.claimBatch(10);
    for (const c of claimed) {
      await outbox.complete(c.id);
    }

    const afterPending = await outbox.getPendingCount();
    expect(afterPending).toBeLessThan(pending);

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = ANY($1)', [[e1.id, e2.id]]);
  });

  it('should map row fields correctly in claimBatch', async () => {
    const outbox = createDomainEventOutbox({ pool: dbPool });

    const payload = makeEvent({
      entryId: 'entry-g',
      reason: 'detailed-reason',
      metadata: { priority: 'high', source: 'test' },
    });

    const enqueued = await outbox.enqueue({
      aggregateType: 'knowledge',
      aggregateId: payload.entryId,
      eventName: payload.name,
      payload,
    });

    const claimed = await outbox.claimBatch(10);
    const found = claimed.find((c) => c.id === enqueued.id);
    expect(found).toBeDefined();

    if (found) {
      expect(found.eventName).toBe('knowledge.approved');
      expect(found.aggregateType).toBe('knowledge');
      expect(found.aggregateId).toBe('entry-g');
      expect(found.payload.entryId).toBe('entry-g');
      expect(found.payload.reason).toBe('detailed-reason');
      expect(found.payload.metadata).toEqual({ priority: 'high', source: 'test' });
      expect(found.attempts).toBe(1); // Incremented by claimBatch

      await outbox.complete(found.id);
    }

    // Clean up
    await dbPool.query('DELETE FROM domain_event_outbox WHERE id = $1', [enqueued.id]);
  });
});
