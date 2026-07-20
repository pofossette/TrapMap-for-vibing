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
import { recordRuntimeExecution } from '@trapmap/server/lib/runtime/index.js';
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
  const { store, adapterRegistry, graphQueryBackend, asyncTransport, jobRuntime } =
    app.skillShareer;
  if (!jobRuntime) {
    throw new Error('server lifecycle requires an injected job-runtime port');
  }
  const indexingHandler = createIndexingSubscriber(
    store,
    adapterRegistry,
    graphQueryBackend,
    asyncTransport?.task,
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
    const outbox = eventTransport;

    const pollIntervalMs = 2000;
    let running = false;
    let runPromise: Promise<void> | null = null;

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
                await Promise.all(handlers.map((h) => h(event.payload as DomainEvent)));
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

    async function start(): Promise<void> {
      if (runPromise) return runPromise;
      runPromise = run();
      try {
        await runPromise;
      } finally {
        runPromise = null;
        running = false;
      }
    }

    if (startOutboxWorker) {
      void start();
      app.log.info('Outbox event worker started');
    } else {
      app.log.info('Outbox event worker ownership registered without starting local processing');
    }

    app.decorate('outboxWorker', {
      isRunning: () => running,
      ownsWork: () => ownsOutboxWork,
      stop: async () => {
        running = false;
        if (runPromise) await runPromise;
      },
    });
  }
}
