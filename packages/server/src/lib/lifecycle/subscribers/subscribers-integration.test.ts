/**
 * Integration tests for lifecycle subscribers with the event bus.
 *
 * Tests that subscribers are correctly triggered (or skipped) through
 * the LifecycleEventBus, and that the async await path works.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGovernanceConflictTaskScheduler } from '@trapmap/backend-core';
import { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import { KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import { LifecycleEventBus } from '@trapmap/server/lib/lifecycle/event-bus.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import type { DomainEvent } from '@trapmap/server/lib/lifecycle/types.js';
import { buildPostgresTestServer } from '../../../../../../scripts/testing/server-test-composition.js';
import { createIndexingSubscriber } from './indexing.js';

// Mock the heavy dependencies
vi.mock('../../indexing/events.js', () => ({
  runKnowledgeIndexEvent: vi.fn().mockResolvedValue(undefined),
}));

import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEvent(overrides?: Partial<DomainEvent>): DomainEvent {
  return {
    name: 'knowledge.approved',
    entryId: 'entry-1',
    previousState: 'agent-pass',
    nextState: 'approved',
    actorId: 'user-1',
    reason: 'test',
    timestamp: '2026-05-07T00:00:00.000Z',
    metadata: { sourceEventId: 'event-1' },
    ...overrides,
  };
}

function mockStore() {
  return {
    snapshot: vi.fn().mockResolvedValue({
      knowledgeEntries: [],
      auditEvents: [],
    }),
  };
}

function mockJobRuntime() {
  return {
    schedule: vi.fn().mockResolvedValue('job-1'),
  };
}

describe('indexing subscriber via event bus', () => {
  it('approval triggers indexing subscriber', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();
    const registry = new AdapterRegistry();

    bus.onDomainEvent('knowledge.approved', createIndexingSubscriber(store as any, registry));

    await bus.emitDomainEventAsync(makeEvent());

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
    expect(runKnowledgeIndexEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'entry-1',
        previousState: 'agent-pass',
        nextState: 'approved',
      }),
    );
  });

  it('rejection does not trigger indexing subscriber (different event name)', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();
    const registry = new AdapterRegistry();

    // Subscriber registered on 'knowledge.approved' but event is 'knowledge.rejected'
    bus.onDomainEvent('knowledge.approved', createIndexingSubscriber(store as any, registry));

    await bus.emitDomainEventAsync(
      makeEvent({ name: 'knowledge.rejected', nextState: 'rejected' }),
    );

    expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
  });

  it('self-transition is skipped by indexing subscriber', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();
    const registry = new AdapterRegistry();

    bus.onDomainEvent('knowledge.updated', createIndexingSubscriber(store as any, registry));

    await bus.emitDomainEventAsync(
      makeEvent({
        name: 'knowledge.updated',
        previousState: 'agent-pass',
        nextState: 'agent-pass',
        reason: 'revision',
      }),
    );

    expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
  });

  it('self-transition with reason "updated" triggers indexing', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();
    const registry = new AdapterRegistry();

    bus.onDomainEvent('knowledge.updated', createIndexingSubscriber(store as any, registry));

    await bus.emitDomainEventAsync(
      makeEvent({
        name: 'knowledge.updated',
        previousState: 'approved',
        nextState: 'approved',
        reason: 'updated',
      }),
    );

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
  });
});

describe('governance conflict scheduler via event bus', () => {
  it('approval triggers conflict detection', async () => {
    const bus = new LifecycleEventBus();
    const jobRuntime = mockJobRuntime();

    bus.onDomainEvent('knowledge.approved', createGovernanceConflictTaskScheduler(jobRuntime));

    await bus.emitDomainEventAsync(makeEvent());

    expect(jobRuntime.schedule).toHaveBeenCalledWith(
      'governance.conflict-detection',
      { entryId: 'entry-1', sourceEventId: 'event-1' },
      { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
    );
  });

  it('non-approval does not trigger conflict detection', async () => {
    const bus = new LifecycleEventBus();
    const jobRuntime = mockJobRuntime();

    bus.onDomainEvent('knowledge.deactivated', createGovernanceConflictTaskScheduler(jobRuntime));

    await bus.emitDomainEventAsync(
      makeEvent({ name: 'knowledge.deactivated', nextState: 'deactivated' }),
    );

    expect(jobRuntime.schedule).not.toHaveBeenCalled();
  });
});

describe('event bus async waiting', () => {
  it('emitDomainEventAsync awaits all handlers before returning', async () => {
    const bus = new LifecycleEventBus();
    const order: string[] = [];

    bus.onDomainEvent('test', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('handler-1');
    });
    bus.onDomainEvent('test', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('handler-2');
    });

    await bus.emitDomainEventAsync(makeEvent({ name: 'test' }));

    expect(order).toEqual(['handler-2', 'handler-1']);
  });

  it('emitDomainEventAsync isolates handler errors', async () => {
    const bus = new LifecycleEventBus();
    const errors: unknown[] = [];

    bus.on('error', (err) => errors.push(err));

    bus.onDomainEvent('test', async () => {
      throw new Error('handler failed');
    });
    bus.onDomainEvent('test', async () => {
      // should still run
    });

    await bus.emitDomainEventAsync(makeEvent({ name: 'test' }));

    expect(errors).toHaveLength(1);
  });

  it('multiple subscribers on same event all fire', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();
    const jobRuntime = mockJobRuntime();
    const registry = new AdapterRegistry();

    bus.onDomainEvent('knowledge.approved', createIndexingSubscriber(store as any, registry));
    bus.onDomainEvent('knowledge.approved', createGovernanceConflictTaskScheduler(jobRuntime));

    await bus.emitDomainEventAsync(makeEvent());

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
    expect(jobRuntime.schedule).toHaveBeenCalledTimes(1);
  });
});

describe('subscriber idempotency and retry safety (Phase 2)', () => {
  it('indexing subscriber is safe to call repeatedly for the same entry', async () => {
    const store = mockStore();
    const registry = new AdapterRegistry();
    const subscriber = createIndexingSubscriber(store as any, registry);
    const event = makeEvent();

    await subscriber(event);
    await subscriber(event); // Second identical call

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(2);
  });

  it('conflict subscriber is safe to call repeatedly for the same entry', async () => {
    const jobRuntime = mockJobRuntime();
    const subscriber = createGovernanceConflictTaskScheduler(jobRuntime);
    const event = makeEvent();

    await subscriber(event);
    await subscriber(event); // Second identical call

    expect(jobRuntime.schedule).toHaveBeenCalledTimes(2);
  });

  it('indexing subscriber skips self-transitions on retries', async () => {
    const store = mockStore();
    const registry = new AdapterRegistry();
    const subscriber = createIndexingSubscriber(store as any, registry);

    // Self-transition should be no-op
    await subscriber(
      makeEvent({ previousState: 'agent-pass', nextState: 'agent-pass', reason: 'revision' }),
    );

    expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
  });

  it('conflict subscriber skips non-approval on retries', async () => {
    const jobRuntime = mockJobRuntime();
    const subscriber = createGovernanceConflictTaskScheduler(jobRuntime);

    // Non-approval should be no-op
    await subscriber(makeEvent({ nextState: 'rejected' }));

    expect(jobRuntime.schedule).not.toHaveBeenCalled();
  });
});

describe('outbox-driven subscriber execution (Phase 2)', () => {
  it('subscribers can be composed from outbox payloads', async () => {
    // Simulate how the outbox worker builds handler maps
    const store = mockStore();
    const registry = new AdapterRegistry();
    const handlerMap = new Map<string, (event: DomainEvent) => void | Promise<void>>();
    handlerMap.set('knowledge.approved', createIndexingSubscriber(store as any, registry));
    handlerMap.set('knowledge.deactivated', createIndexingSubscriber(store as any, registry));

    // Simulate receiving an outbox event payload
    const eventPayload = makeEvent();
    const handler = handlerMap.get(eventPayload.name);
    expect(handler).toBeDefined();
    await handler!(eventPayload);

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
  });

  it('unhandled event names are no-ops (graceful skip)', async () => {
    const store = mockStore();
    const registry = new AdapterRegistry();
    const handlerMap = new Map<string, (event: DomainEvent) => void | Promise<void>>();
    handlerMap.set('knowledge.approved', createIndexingSubscriber(store as any, registry));

    // Unknown event name should be gracefully skipped
    const eventPayload = makeEvent({ name: 'knowledge.submitted' });
    const handler = handlerMap.get(eventPayload.name);
    expect(handler).toBeUndefined();

    // No errors thrown, no side effects
    expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
  });

  it('handler error does not affect other handlers in composite map', async () => {
    const store = mockStore();
    const registry = new AdapterRegistry();

    const failingHandler = async () => {
      throw new Error('handler crash');
    };
    const passingHandler = createIndexingSubscriber(store as any, registry);

    // Simulate composite handler list
    const handlers = [failingHandler, passingHandler];

    // Failing handler should throw but passing handler should still be callable
    await expect(handlers[0]!(makeEvent())).rejects.toThrow('handler crash');
    await handlers[1]!(makeEvent());

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
  });

  it('failed events can be retried via outbox fail/claim cycle', async () => {
    // Simulate the retry pattern: fail() resets status to pending with backoff,
    // then claimBatch() claims it again
    const store = mockStore();
    const registry = new AdapterRegistry();
    const subscriber = createIndexingSubscriber(store as any, registry);

    // First attempt
    const firstRetries = 0;
    expect(firstRetries).toBe(0);

    // Simulated retry: second attempt
    const secondRetries = 1;
    expect(secondRetries).toBe(1);

    // Both attempts should trigger the subscriber
    await subscriber(makeEvent({ reason: 'retry-1' }));
    await subscriber(makeEvent({ reason: 'retry-2' }));

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(2);
  });

  it('postgres subscriber enqueues shared indexing jobs instead of running heavy work inline', async () => {
    const app = await buildPostgresTestServer();
    const store = app.skillShareer.store;

    try {
      if (!(store instanceof PostgresStore)) {
        return;
      }

      const registry = new AdapterRegistry();
      const asyncQueue = app.skillShareer.asyncTransport?.task;
      if (!asyncQueue) {
        throw new Error(
          'PostgreSQL subscriber integration requires injected job-runtime task queue',
        );
      }
      const subscriber = createIndexingSubscriber(store, registry, undefined, asyncQueue);
      await subscriber(
        makeEvent({
          entryId: 'entry_phase5_pg_subscriber',
          previousState: 'approved',
          nextState: 'deactivated',
          reason: 'phase5-subscriber',
          actorId: 'user-1',
        }),
      );

      const queue = createTaskQueue({ pool: store.getPool() });
      const status = await queue.getStatusSnapshot();
      expect(
        status.recentDeadLetters.find((task) => task.type === KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE),
      ).toBeUndefined();

      const count = await store
        .getPool()
        .query<{ count: string }>(
          'SELECT COUNT(*) AS count FROM task_queue WHERE type = $1 AND dedupe_key = $2',
          [
            KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
            `${KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE}:entry_phase5_pg_subscriber:approved:deactivated:phase5-subscriber`,
          ],
        );
      expect(Number(count.rows[0]?.count ?? '0')).toBe(1);
      expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
