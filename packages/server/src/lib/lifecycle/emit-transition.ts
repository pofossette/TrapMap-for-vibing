/**
 * Single emission point for lifecycle transition events.
 *
 * Chooses the correct channel based on store backend:
 * - PG mode: enqueue to domain_event_outbox for async worker processing
 * - JSON mode (InMemory/JsonStore): synchronous eventBus for lightweight local development
 *
 * Routes should call this after their store transaction commits.
 *
 * Phase 4: Converge PG lifecycle projections on outbox
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { PoolClient } from 'pg';

import { type SkillShareerStore, getStorePool, nowIso } from '@trapmap/server/lib/store.js';

import type { LifecycleEventBus } from './event-bus.js';
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
  asyncTransport?: {
    events: {
      enqueue(params: {
        aggregateType: string;
        aggregateId: string;
        eventName: string;
        payload: DomainEvent;
      }): Promise<unknown>;
      enqueueTx(
        client: PoolClient,
        params: {
          aggregateType: string;
          aggregateId: string;
          eventName: string;
          payload: DomainEvent;
        },
      ): Promise<unknown>;
    };
  };
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

  if (getStorePool(store)) {
    const transport = params.asyncTransport;
    if (!transport) {
      throw new Error('Postgres lifecycle transition requires async transport');
    }
    const enqueue = params.txClient
      ? transport.events.enqueueTx.bind(transport.events, params.txClient)
      : transport.events.enqueue;
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
