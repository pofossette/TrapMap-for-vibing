/**
 * Domain event types for lifecycle state transitions.
 *
 * This module defines:
 * - DomainEvent: event payload emitted after a lifecycle transition
 * - DomainEventHandler: handler function for domain events
 * - TransitionDefinition: transition table entry with event metadata
 * - TransitionContext: context passed to transition guards
 *
 * Phase: 101 (Lifecycle State Machine with Event Bus)
 */

import type { LifecycleState } from '@trapmap/contracts';

/** Domain event emitted after a lifecycle state transition commits. */
export interface DomainEvent {
  /** Event name (e.g., 'knowledge.approved', 'knowledge.deactivated') */
  name: string;
  /** ID of the knowledge entry that transitioned */
  entryId: string;
  /** Lifecycle state before the transition */
  previousState: LifecycleState;
  /** Lifecycle state after the transition */
  nextState: LifecycleState;
  /** ID of the actor who triggered the transition */
  actorId: string;
  /** Human-readable reason for the transition */
  reason: string;
  /** ISO 8601 timestamp of the event */
  timestamp: string;
  /** Optional additional data */
  metadata?: Record<string, unknown>;
}

/** Handler function for domain events. May be sync or async. */
export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/** Definition of a lifecycle state transition with event metadata. */
export interface TransitionDefinition {
  /** Source lifecycle state */
  from: LifecycleState;
  /** Target lifecycle state */
  to: LifecycleState;
  /** Event name emitted when this transition occurs */
  event: string;
  /** Optional guard function -- transition only proceeds if guard returns true */
  guard?: (ctx: TransitionContext) => boolean | Promise<boolean>;
}

/** Context passed to transition guards and included in domain events. */
export interface TransitionContext {
  /** ID of the knowledge entry being transitioned */
  entryId: string;
  /** ID of the actor triggering the transition */
  actorId: string;
  /** Human-readable reason */
  reason: string;
  /** Optional additional data */
  metadata?: Record<string, unknown>;
}
