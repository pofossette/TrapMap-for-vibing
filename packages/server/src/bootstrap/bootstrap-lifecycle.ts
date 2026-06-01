/**
 * Bootstrap lifecycle — register event subscribers and start outbox worker.
 *
 * Runs AFTER repositories are initialized so that store and adapter registry
 * are available for event handling.
 */

import type { FastifyInstance } from 'fastify';

import { createDomainEventOutbox } from '@trapmap/server/lib/lifecycle/outbox.js';
import { createAuditSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/audit.js';
import { createConflictSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/conflict.js';
import { createIndexingSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/indexing.js';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';

export async function bootstrapLifecycle(app: FastifyInstance): Promise<void> {
  const { eventBus, store, adapterRegistry } = app.skillShareer;

  // Indexing subscriber: syncs knowledge indexes on state transitions
  eventBus.onDomainEvent(
    'knowledge.approved',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );
  eventBus.onDomainEvent(
    'knowledge.deactivated',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );
  eventBus.onDomainEvent(
    'knowledge.agent-reviewed',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );
  eventBus.onDomainEvent(
    'knowledge.rejected',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );
  eventBus.onDomainEvent(
    'knowledge.resubmitted',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );
  eventBus.onDomainEvent(
    'knowledge.re-review',
    createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
  );

  // Audit subscriber: logs lifecycle transitions
  eventBus.onDomainEvent('knowledge.approved', createAuditSubscriber(store, app.log));
  eventBus.onDomainEvent('knowledge.deactivated', createAuditSubscriber(store, app.log));
  eventBus.onDomainEvent('knowledge.rejected', createAuditSubscriber(store, app.log));
  eventBus.onDomainEvent('knowledge.agent-reviewed', createAuditSubscriber(store, app.log));
  eventBus.onDomainEvent('knowledge.resubmitted', createAuditSubscriber(store, app.log));
  eventBus.onDomainEvent('knowledge.re-review', createAuditSubscriber(store, app.log));

  // Conflict subscriber: detects conflicts on approval
  eventBus.onDomainEvent('knowledge.approved', createConflictSubscriber(store));

  // Error handler: log subscriber failures without crashing
  eventBus.on('error', ({ event, error, handler }) => {
    app.log.error(
      { error, eventName: event.name, entryId: event.entryId, handler },
      'Event subscriber error',
    );
  });

  // Start outbox event worker for PG mode
  // Processes domain events asynchronously — indexing, conflict detection, audit
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    const outbox = createDomainEventOutbox({ pool });

    const handlerMap = new Map<string, DomainEventHandler>([
      [
        'knowledge.approved',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      [
        'knowledge.deactivated',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      [
        'knowledge.agent-reviewed',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      [
        'knowledge.rejected',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      [
        'knowledge.resubmitted',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      [
        'knowledge.re-review',
        createIndexingSubscriber(store, adapterRegistry, app.skillShareer.graphQueryBackend),
      ],
      ['knowledge.approved+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.deactivated+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.rejected+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.agent-reviewed+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.resubmitted+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.re-review+audit', createAuditSubscriber(store, app.log)],
      ['knowledge.approved+conflict', createConflictSubscriber(store)],
    ]);

    // Build composite handler map: each event name can have multiple handlers
    const compositeHandlers = new Map<string, DomainEventHandler[]>();
    for (const [key, handler] of handlerMap) {
      const eventName = key.includes('+') ? key.split('+')[0]! : key;
      const list = compositeHandlers.get(eventName) ?? [];
      list.push(handler);
      compositeHandlers.set(eventName, list);
    }

    const pollIntervalMs = 2000;
    let running = false;

    async function run(): Promise<void> {
      running = true;
      while (running) {
        try {
          const events = await outbox.claimBatch(10);
          for (const event of events) {
            const handlers = compositeHandlers.get(event.eventName);
            if (handlers && handlers.length > 0) {
              try {
                await Promise.all(handlers.map((h) => h(event.payload)));
                await outbox.complete(event.id);
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await outbox.fail(event.id, msg);
                app.log.error(
                  { error: msg, eventName: event.eventName, aggregateId: event.aggregateId },
                  'Outbox event handler failed',
                );
              }
            } else {
              await outbox.complete(event.id);
            }
          }
          if (events.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }
        } catch (error) {
          app.log.error({ error }, 'Outbox worker poll error');
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
    }

    void run();
    app.log.info('Outbox event worker started');

    app.decorate('outboxWorker', {
      stop: () => {
        running = false;
      },
    });
  }
}
