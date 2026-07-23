/**
 * Lifecycle barrel -- re-exports public API from lifecycle module files.
 */

// Types
export type {
  DomainEvent,
  DomainEventHandler,
} from './lifecycle-types.js';

// Event bus
export { LifecycleEventBus } from './lifecycle-event-bus.js';

// State machine
export { transitionLifecycleState } from './lifecycle-state-machine.js';
