/**
 * Lifecycle barrel -- re-exports public API from lifecycle module files.
 *
 * Covers domain events, event bus, state machine transitions, publisher,
 * emission channel, outbox, and subscriber factories.
 *
 * Note: packages/server/src/lib/state-machines/index.ts already re-exports
 * lifecycle state-machine symbols (isValidTransition, getValidTransitions,
 * isTerminalState, transitionLifecycleState) and decay state-machine symbols.
 * Consumers can import from either location; this barrel is authoritative
 * for the full lifecycle surface.
 */

// Types
export type {
  DomainEvent,
  DomainEventHandler,
} from './types.js';

// Event bus
export { LifecycleEventBus } from './event-bus.js';

// State machine
export { transitionLifecycleState } from './state-machine.js';

// Outbox
export type { OutboxStatusSnapshot } from './outbox.js';

// Subscribers
export { createAuditSubscriber } from './subscribers/audit.js';
export { createIndexingSubscriber } from './subscribers/indexing.js';
