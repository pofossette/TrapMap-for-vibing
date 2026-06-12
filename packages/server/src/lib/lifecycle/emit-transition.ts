/**
 * Single emission point for lifecycle transition events.
 *
 * Chooses the correct channel based on store backend:
 * - PG mode (PostgresStore): enqueue to domain_event_outbox for async worker processing
 * - JSON mode (InMemory/JsonStore): synchronous eventBus for lightweight local development
 *
 * Routes should call this after their store transaction commits.
 *
 * Phase 4: Converge PG lifecycle projections on outbox
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { PoolClient } from 'pg';

import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import type { LifecycleEventBus } from './event-bus.js';
import { createDomainEventOutbox } from './outbox.js';
import { findTransitionEvent } from './transitions.js';
import type { DomainEvent } from './types.js';

/**
 * Emit a lifecycle transition event through the correct channel.
 *
 * Returns early (no-op) when:
 * - previousState === nextState (self-transition, nothing changed)
 * - no event mapping exists for the (from, to) pair
 */
export async function emitLifecycleTransition(params: {
  store: SkillShareerStore;
  eventBus: LifecycleEventBus;
  aggregateType: string;
  aggregateId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  actorId: string;
  reason: string;
  txClient?: PoolClient;
}): Promise<void> {
  const { store, eventBus, aggregateType, aggregateId, previousState, nextState, actorId, reason } =
    params;

  if (previousState === nextState) return;

  const eventName = findTransitionEvent(previousState, nextState);
  if (!eventName) return;

  const eventPayload: DomainEvent = {
    name: eventName,
    entryId: aggregateId,
    previousState,
    nextState,
    actorId,
    reason,
    timestamp: nowIso(),
  };

  if (store instanceof PostgresStore) {
    const outbox = createDomainEventOutbox({ pool: store.getPool() });
    const enqueue = params.txClient ? outbox.enqueueTx.bind(outbox, params.txClient) : outbox.enqueue;
    await enqueue({
      aggregateType,
      aggregateId,
      eventName,
      payload: eventPayload,
    });
  } else {
    // JSON mode: keep synchronous eventBus for lightweight local runs
    await eventBus.emitDomainEventAsync(eventPayload);
  }
}
