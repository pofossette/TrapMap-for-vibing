/**
 * Decay barrel -- re-exports public API from decay module files.
 *
 * Covers decay configuration loading, the pure decay state machine,
 * and freshness-based decay computation functions.
 */

// Config
export { loadDecayConfig } from './config.js';

// State machine
export type { DecayableEntry } from './state-machine.js';
export {
  DEFAULT_DECAY_CONFIG,
  computeDecayState,
  isTerminalDecayState,
  requiresAttention,
  validateDecayConfig,
} from './state-machine.js';

// Freshness
export {
  DEFAULT_FRESHNESS_CONFIG,
  exponentialDecay,
  linearDecay,
  stepDecay,
  computeFreshnessMultiplier,
} from './freshness.js';
