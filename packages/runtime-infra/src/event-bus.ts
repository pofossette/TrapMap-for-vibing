import { EventEmitter } from 'node:events';

import type { DomainEvent, DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';

export class LifecycleEventBus extends EventEmitter {
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

  onDomainEvent(eventName: string, handler: DomainEventHandler): this {
    return this.on(eventName, handler);
  }
}
