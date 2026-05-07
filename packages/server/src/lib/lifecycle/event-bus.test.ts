import { describe, expect, it, vi } from 'vitest';

import { LifecycleEventBus } from './event-bus.js';
import type { DomainEvent } from './types.js';

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

describe('LifecycleEventBus', () => {
  describe('emitDomainEvent', () => {
    it('dispatches to registered handlers', () => {
      const bus = new LifecycleEventBus();
      const handler = vi.fn();
      bus.onDomainEvent('knowledge.approved', handler);

      const event = makeEvent();
      bus.emitDomainEvent(event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('dispatches to multiple handlers for the same event', () => {
      const bus = new LifecycleEventBus();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.onDomainEvent('knowledge.approved', handler1);
      bus.onDomainEvent('knowledge.approved', handler2);

      bus.emitDomainEvent(makeEvent());

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('does not dispatch to handlers for different events', () => {
      const bus = new LifecycleEventBus();
      const handler = vi.fn();
      bus.onDomainEvent('knowledge.deactivated', handler);

      bus.emitDomainEvent(makeEvent({ name: 'knowledge.approved' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('executes handlers in registration order', () => {
      const bus = new LifecycleEventBus();
      const order: number[] = [];
      bus.onDomainEvent('knowledge.approved', () => {
        order.push(1);
      });
      bus.onDomainEvent('knowledge.approved', () => {
        order.push(2);
      });
      bus.onDomainEvent('knowledge.approved', () => {
        order.push(3);
      });

      bus.emitDomainEvent(makeEvent());

      expect(order).toEqual([1, 2, 3]);
    });

    it('does not throw when no listeners registered', () => {
      const bus = new LifecycleEventBus();
      expect(() => bus.emitDomainEvent(makeEvent())).not.toThrow();
    });
  });

  describe('error isolation', () => {
    it('catches synchronous handler errors and emits error event', () => {
      const bus = new LifecycleEventBus();
      const errorHandler = vi.fn();
      bus.on('error', errorHandler);

      bus.onDomainEvent('knowledge.approved', () => {
        throw new Error('sync failure');
      });

      bus.emitDomainEvent(makeEvent());

      expect(errorHandler).toHaveBeenCalledOnce();
      const payload = errorHandler.mock.calls[0]?.[0] as {
        event: DomainEvent;
        error: Error;
        handler: string;
      };
      expect(payload.error.message).toBe('sync failure');
      expect(payload.event.name).toBe('knowledge.approved');
    });

    it('catches async handler rejections and emits error event', async () => {
      const bus = new LifecycleEventBus();
      const errorHandler = vi.fn();
      bus.on('error', errorHandler);

      bus.onDomainEvent('knowledge.approved', () => {
        return Promise.reject(new Error('async failure'));
      });

      bus.emitDomainEvent(makeEvent());

      // Let the microtask settle
      await new Promise((r) => setTimeout(r, 0));

      expect(errorHandler).toHaveBeenCalledOnce();
      const payload = errorHandler.mock.calls[0]?.[0] as {
        event: DomainEvent;
        error: Error;
        handler: string;
      };
      expect(payload.error.message).toBe('async failure');
    });

    it('continues dispatching to remaining handlers after one fails', () => {
      const bus = new LifecycleEventBus();
      const errorHandler = vi.fn();
      bus.on('error', errorHandler);
      const laterHandler = vi.fn();

      bus.onDomainEvent('knowledge.approved', () => {
        throw new Error('boom');
      });
      bus.onDomainEvent('knowledge.approved', laterHandler);

      bus.emitDomainEvent(makeEvent());

      expect(errorHandler).toHaveBeenCalledOnce();
      expect(laterHandler).toHaveBeenCalledOnce();
    });
  });

  describe('onDomainEvent', () => {
    it('returns this for chaining', () => {
      const bus = new LifecycleEventBus();
      const result = bus.onDomainEvent('knowledge.approved', vi.fn());
      expect(result).toBe(bus);
    });

    it('registers handler that receives events', () => {
      const bus = new LifecycleEventBus();
      const handler = vi.fn();
      bus.onDomainEvent('knowledge.approved', handler);

      const event = makeEvent();
      bus.emitDomainEvent(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });
});
