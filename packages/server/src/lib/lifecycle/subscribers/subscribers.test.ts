import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdapterRegistry } from '@trapmap/server/lib/indexing/registry.js';
import type { DomainEvent } from '@trapmap/server/lib/lifecycle/types.js';
import { createAuditSubscriber } from './audit.js';
import { createConflictSubscriber } from './conflict.js';
import { createIndexingSubscriber } from './indexing.js';

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
    ...overrides,
  };
}

function mockStore() {
  return {
    snapshot: vi.fn().mockResolvedValue({
      knowledgeEntries: [],
      auditEvents: [],
    }),
    transact: vi.fn().mockImplementation(async (fn: (data: any) => any) => {
      const data = { knowledgeEntries: [], auditEvents: [] };
      return fn(data);
    }),
    nextId: vi.fn().mockReturnValue('id-1'),
  };
}

function mockJobRuntime() {
  return {
    schedule: vi.fn().mockResolvedValue('job-1'),
  };
}

describe('createIndexingSubscriber', () => {
  it('calls runKnowledgeIndexEvent for non-self transitions', async () => {
    const store = mockStore();
    const subscriber = createIndexingSubscriber(store as any, new AdapterRegistry());
    const event = makeEvent({ previousState: 'agent-pass', nextState: 'approved' });

    await subscriber(event);

    expect(runKnowledgeIndexEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'entry-1',
        previousState: 'agent-pass',
        nextState: 'approved',
        reason: 'test',
      }),
    );
  });

  it('skips self-transitions', async () => {
    const store = mockStore();
    const subscriber = createIndexingSubscriber(store as any, new AdapterRegistry());
    const event = makeEvent({ previousState: 'agent-pass', nextState: 'agent-pass' });

    await subscriber(event);

    expect(runKnowledgeIndexEvent).not.toHaveBeenCalled();
  });

  it('passes registry to runKnowledgeIndexEvent', async () => {
    const store = mockStore();
    const registry = new AdapterRegistry();
    const subscriber = createIndexingSubscriber(store as any, registry);
    const event = makeEvent();

    await subscriber(event);

    expect(runKnowledgeIndexEvent).toHaveBeenCalledWith(expect.objectContaining({ registry }));
  });
});

describe('createAuditSubscriber', () => {
  it('logs the transition info', () => {
    const mockLog = { info: vi.fn() };
    const subscriber = createAuditSubscriber(mockStore() as any, mockLog);
    const event = makeEvent();

    subscriber(event);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          name: 'knowledge.approved',
          entryId: 'entry-1',
          previousState: 'agent-pass',
          nextState: 'approved',
          actorId: 'user-1',
          reason: 'test',
          timestamp: '2026-05-07T00:00:00.000Z',
        }),
      }),
      expect.stringContaining('Lifecycle audit'),
    );
  });
});

describe('createConflictSubscriber', () => {
  it('schedules governance conflict detection for approved events', async () => {
    const jobRuntime = mockJobRuntime();
    const subscriber = createConflictSubscriber(jobRuntime as any);
    const event = makeEvent({
      nextState: 'approved',
      metadata: { sourceEventId: 'event-1' },
    });

    await subscriber(event);

    expect(jobRuntime.schedule).toHaveBeenCalledWith(
      'governance.conflict-detection',
      { entryId: 'entry-1', sourceEventId: 'event-1' },
      { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
    );
  });

  it('does not schedule conflict detection for non-approved events', async () => {
    const jobRuntime = mockJobRuntime();
    const subscriber = createConflictSubscriber(jobRuntime as any);
    const event = makeEvent({ nextState: 'deactivated' });

    await subscriber(event);

    expect(jobRuntime.schedule).not.toHaveBeenCalled();
  });
});
