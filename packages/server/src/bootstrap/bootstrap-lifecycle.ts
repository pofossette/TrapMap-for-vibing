/**
 * Bootstrap lifecycle — register event subscribers and start outbox worker.
 *
 * Runs AFTER repositories are initialized so that store and adapter registry
 * are available for event handling.
 */

import type { FastifyInstance } from 'fastify';

import { createAuditSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/audit.js';
import { createConflictSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/conflict.js';
import { createIndexingSubscriber } from '@trapmap/server/lib/lifecycle/subscribers/indexing.js';
import type { DomainEventHandler } from '@trapmap/server/lib/lifecycle/types.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { recordRuntimeExecution } from '@trapmap/server/lib/runtime/metrics.js';

const INDEXING_EVENT_NAMES = [
  'knowledge.approved',
  'knowledge.deactivated',
  'knowledge.agent-reviewed',
  'knowledge.rejected',
  'knowledge.resubmitted',
  'knowledge.re-review',
] as const;

type LifecycleEventName = (typeof INDEXING_EVENT_NAMES)[number];

interface LifecycleSubscriberRegistration {
  eventName: LifecycleEventName;
  handlers: readonly DomainEventHandler[];
}

interface LifecycleSubscriberContract {
  readonly registrations: readonly LifecycleSubscriberRegistration[];
  readonly compositeHandlers: ReadonlyMap<LifecycleEventName, readonly DomainEventHandler[]>;
}

export interface BootstrapLifecycleOptions {
  startOutboxWorker?: boolean;
  ownsOutboxWork?: boolean;
}

function buildLifecycleSubscriberContract(app: FastifyInstance): LifecycleSubscriberContract {
  const { store, adapterRegistry, graphQueryBackend, asyncTransport } = app.skillShareer;
  const indexingHandler = createIndexingSubscriber(
    store,
    adapterRegistry,
    graphQueryBackend,
    asyncTransport?.queue,
  );
  const auditHandler = createAuditSubscriber(store, app.log);
  const conflictHandler = createConflictSubscriber(store);

  const registrations = INDEXING_EVENT_NAMES.map((eventName) => ({
    eventName,
    handlers:
      eventName === 'knowledge.approved'
        ? [indexingHandler, auditHandler, conflictHandler]
        : [indexingHandler, auditHandler],
  }));

  return {
    registrations,
    compositeHandlers: new Map(
      registrations.map(({ eventName, handlers }) => [eventName, handlers] as const),
    ),
  };
}

export async function bootstrapLifecycle(
  app: FastifyInstance,
  options: BootstrapLifecycleOptions = {},
): Promise<void> {
  const { eventBus, store } = app.skillShareer;
  const { startOutboxWorker = true, ownsOutboxWork = startOutboxWorker } = options;
  const lifecycleContract = buildLifecycleSubscriberContract(app);

  for (const registration of lifecycleContract.registrations) {
    for (const handler of registration.handlers) {
      eventBus.onDomainEvent(registration.eventName, handler);
    }
  }

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
    const outbox = app.skillShareer.asyncTransport?.events;
    if (!outbox) {
      throw new Error('Postgres runtime requires asyncTransport.events for outbox processing');
    }

    const pollIntervalMs = 2000;
    let running = false;

    async function run(): Promise<void> {
      running = true;
      while (running) {
        try {
          const events = await outbox.claimBatch(10);
          for (const event of events) {
            const handlers = lifecycleContract.compositeHandlers.get(
              event.eventName as LifecycleEventName,
            );
            if (handlers && handlers.length > 0) {
              try {
                await Promise.all(handlers.map((h) => h(event.payload)));
                await outbox.complete(event.id);
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                await outbox.fail(event.id, msg);
                recordRuntimeExecution({
                  dependencyName: 'outbox-worker',
                  failureKind: 'retryable',
                });
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
          recordRuntimeExecution({
            dependencyName: 'outbox-worker',
            failureKind: 'retryable',
          });
          app.log.error({ error }, 'Outbox worker poll error');
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
    }

    if (startOutboxWorker) {
      void run();
      app.log.info('Outbox event worker started');
    } else {
      app.log.info('Outbox event worker ownership registered without starting local processing');
    }

    app.decorate('outboxWorker', {
      isRunning: () => running,
      ownsWork: () => ownsOutboxWork,
      stop: () => {
        running = false;
      },
    });
  }
}
