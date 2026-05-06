/**
 * Unified barrel export for state machine modules.
 * Re-exports all public APIs from decay and lifecycle state machines.
 */

// Decay state machine: computeDecayState, isTerminalDecayState, requiresAttention, validateDecayConfig, DecayableEntry, DEFAULT_DECAY_CONFIG
export * from '../decay/state-machine.js';

// Lifecycle state machine: isValidTransition, getValidTransitions, isTerminalState, transitionLifecycleState
export * from '../lifecycle/state-machine.js';
