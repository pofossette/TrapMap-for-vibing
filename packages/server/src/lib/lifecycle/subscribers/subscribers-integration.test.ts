/**
 * Integration tests for lifecycle subscribers with the event bus.
 *
 * Tests that subscribers are correctly triggered (or skipped) through
 * the LifecycleEventBus, and that the async await path works.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdapterRegistry } from '../../indexing/registry.js';
import { LifecycleEventBus } from '../event-bus.js';
import type { DomainEvent } from '../types.js';
import { createConflictSubscriber } from './conflict.js';
import { createIndexingSubscriber } from './indexing.js';

// Mock the heavy dependencies
vi.mock('../../indexing/events.js', () => ({
  runKnowledgeIndexEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../conflict/detect.js', () => ({
  detectConflicts: vi.fn().mockResolvedValue([]),
}));

import { detectConflicts } from '../../conflict/detect.js';
import { runKnowledgeIndexEvent } from '../../indexing/events.js';

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

describe('conflict subscriber via event bus', () => {
  it('approval triggers conflict detection', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();

    bus.onDomainEvent('knowledge.approved', createConflictSubscriber(store as any));

    await bus.emitDomainEventAsync(makeEvent());

    expect(detectConflicts).toHaveBeenCalledTimes(1);
    expect(detectConflicts).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'entry-1' }));
  });

  it('non-approval does not trigger conflict detection', async () => {
    const bus = new LifecycleEventBus();
    const store = mockStore();

    bus.onDomainEvent('knowledge.deactivated', createConflictSubscriber(store as any));

    await bus.emitDomainEventAsync(
      makeEvent({ name: 'knowledge.deactivated', nextState: 'deactivated' }),
    );

    expect(detectConflicts).not.toHaveBeenCalled();
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
    const registry = new AdapterRegistry();

    bus.onDomainEvent('knowledge.approved', createIndexingSubscriber(store as any, registry));
    bus.onDomainEvent('knowledge.approved', createConflictSubscriber(store as any));

    await bus.emitDomainEventAsync(makeEvent());

    expect(runKnowledgeIndexEvent).toHaveBeenCalledTimes(1);
    expect(detectConflicts).toHaveBeenCalledTimes(1);
  });
});
