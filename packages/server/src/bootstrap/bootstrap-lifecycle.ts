/**
 * Bootstrap lifecycle — register event subscribers and start outbox worker.
 *
 * Runs AFTER repositories are initialized so that store and adapter registry
 * are available for event handling.
 */

import type { FastifyInstance } from 'fastify';

import { createGovernanceConflictTaskScheduler } from '@trapmap/backend-core';
import {
  createAuditSubscriber,
  createIndexingSubscriber,
} from '@trapmap/server/lib/lifecycle/index.js';
import type { DomainEvent, DomainEventHandler } from '@trapmap/server/lib/lifecycle/index.js';
import { getStorePool } from '@trapmap/server/lib/store.js';

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
  const { store, adapterRegistry, graphQueryBackend, graphIndex, asyncTransport, jobRuntime } =
    app.skillShareer;
  if (!jobRuntime) {
    throw new Error('server lifecycle requires an injected job-runtime port');
  }
  const indexingHandler = createIndexingSubscriber(
    store,
    adapterRegistry,
    graphQueryBackend,
    asyncTransport?.task,
    graphIndex,
  );
  const auditHandler = createAuditSubscriber(store, app.log);
  const conflictHandler = createGovernanceConflictTaskScheduler(jobRuntime);

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
  if (getStorePool(store)) {
    const eventTransport = app.skillShareer.asyncTransport?.events;
    if (!eventTransport) {
      throw new Error('Postgres runtime requires postgres-backed async event transport');
    }
    if (eventTransport.kind !== 'postgres-domain-outbox') {
      throw new Error(`Unsupported event transport kind: ${eventTransport.kind}`);
    }
    const outboxWorkerFactory = app.skillShareer.outboxWorkerFactory;
    if (!outboxWorkerFactory) {
      throw new Error('server lifecycle requires an injected job-runtime outbox worker factory');
    }
    const outboxWorker = outboxWorkerFactory.create({
      outbox: eventTransport,
      ownsWork: ownsOutboxWork,
      handlers: lifecycleContract.registrations.map((registration) => ({
        eventName: registration.eventName,
        handle: async (payload) => {
          await Promise.all(
            registration.handlers.map((handler) => handler(payload as DomainEvent)),
          );
        },
      })),
      onError(error, event) {
        app.log.error(
          { error, eventName: event?.eventName, aggregateId: event?.aggregateId },
          'Job-runtime outbox event handler failed',
        );
      },
    });

    if (startOutboxWorker) {
      void outboxWorker.run();
      app.log.info('Outbox event worker started');
    } else {
      app.log.info('Outbox event worker ownership registered without starting local processing');
    }

    app.decorate('outboxWorker', outboxWorker);
  }
}
