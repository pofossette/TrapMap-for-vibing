import { describe, expect, it, vi } from 'vitest';

import { LifecycleEventBus } from './event-bus.js';

describe('runtime-infra lifecycle event bus', () => {
  it('dispatches to registered handlers and isolates failures', async () => {
    const bus = new LifecycleEventBus();
    const handler = vi.fn();
    const errorHandler = vi.fn();

    bus.on('error', errorHandler);
    bus.onDomainEvent('knowledge.approved', () => {
      throw new Error('boom');
    });
    bus.onDomainEvent('knowledge.approved', handler);

    bus.emitDomainEvent({
      name: 'knowledge.approved',
      entryId: 'entry-1',
      previousState: 'agent-pass',
      nextState: 'approved',
      actorId: 'user-1',
      reason: 'test',
      timestamp: '2026-05-07T00:00:00.000Z',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorHandler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });
});
