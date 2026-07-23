/**
 * LifecycleEventBus -- domain event dispatch with error isolation.
 *
 * Extends Node.js EventEmitter to provide domain event emission where
 * each handler is individually wrapped in try/catch. One handler failure
 * does not block other handlers or the caller. Async handler rejections
 * are caught and re-emitted as 'error' events on the bus.
 *
 * Phase: 101 (Lifecycle State Machine with Event Bus)
 */

import { EventEmitter } from 'node:events';
import type { DomainEvent, DomainEventHandler } from './lifecycle-types.js';

export class LifecycleEventBus extends EventEmitter {
  /**
   * Emit a domain event to all registered handlers.
   * Each handler is wrapped in try/catch -- one failure does not block others.
   * Async handlers are fire-and-forget with error capture.
   */
  emitDomainEvent(event: DomainEvent): void {
    const handlers = this.listeners(event.name) as DomainEventHandler[];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result && typeof result === 'object' && 'catch' in result) {
          (result as Promise<void>).catch((error) => {
            this.emit('error', { event, error, handler: handler.name ?? 'anonymous' });
          });
        }
      } catch (error) {
        this.emit('error', { event, error, handler: handler.name ?? 'anonymous' });
      }
    }
  }

  /**
   * Emit a domain event and await all handlers.
   * Like emitDomainEvent but collects async handler results and awaits them.
   * Individual handler failures are caught and emitted as 'error' events.
   */
  async emitDomainEventAsync(event: DomainEvent): Promise<void> {
    const handlers = this.listeners(event.name) as DomainEventHandler[];
    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result && typeof result === 'object' && 'catch' in result) {
          promises.push(
            (result as Promise<void>).catch((error) => {
              this.emit('error', { event, error, handler: handler.name ?? 'anonymous' });
            }),
          );
        }
      } catch (error) {
        this.emit('error', { event, error, handler: handler.name ?? 'anonymous' });
      }
    }
    await Promise.all(promises);
  }

  /**
   * Register a domain event handler for a specific event name.
   * Returns `this` for chaining.
   */
  onDomainEvent(eventName: string, handler: DomainEventHandler): this {
    return this.on(eventName, handler);
  }
}
