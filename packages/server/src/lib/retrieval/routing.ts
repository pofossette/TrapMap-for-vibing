/**
 * Strategy selection and routing trace logic for the retrieval orchestrator.
 *
 * Extracted from orchestrator.ts to isolate routing decisions from recall execution.
 * All functions are pure (no side effects, no services dependency).
 */

import type { RetrievalStrategy, RoutingReason } from '@trapmap/contracts';
import type { RoutingChannel } from './types.js';

/**
 * Internal routing decision produced by the strategy selector.
 * Used by the orchestrator for RAG logging and channel tracking.
 */
interface RetrievalDecision {
  selectedMode: RetrievalStrategy;
  routeFamily: 'entry' | 'capsule' | 'graph-plan';
  routingReason: RoutingReason;
  fallbackApplied: boolean;
  fallbackTarget: null;
  confidenceScore: number | null;
  confidenceBucket: 'low' | 'medium' | 'high' | null;
  channelsPlanned: RoutingChannel[];
  channelsUsed: RoutingChannel[];
}

/**
 * Map v1 public mode to internal strategy and channels.
 * This mapping preserves backward compatibility while producing trace metadata.
 */
const V1_MODE_TO_STRATEGY: Record<string, RetrievalStrategy> = {
  semantic: 'local',
  hybrid: 'hybrid',
  'graph-assisted': 'mix',
};

/**
 * Get channels planned for a given v1 public mode.
 */
function getV1ChannelsPlanned(mode: string): RoutingChannel[] {
  switch (mode) {
    case 'semantic':
      return ['semantic'];
    case 'hybrid':
      return ['semantic', 'keyword'];
    case 'graph-assisted':
      return ['semantic', 'keyword', 'graph'];
    default:
      return ['semantic'];
  }
}

/**
 * Select retrieval strategy for v1 (entry-based) endpoint.
 *
 * The router produces a deterministic RoutingDecision from:
 * - The explicit mode requested by the client (if any)
 * - Deterministic cues from parseSeedIntent (for auto mode)
 *
 * @param requestedMode - The v1 mode from the request (semantic, hybrid, graph-assisted)
 * @param seed - The raw seed text (used for deterministic auto-routing)
 * @returns RoutingDecision with selected strategy and trace metadata
 */
export function selectRetrievalStrategy(requestedMode: string, seed: string): RetrievalDecision {
  // v1 always uses explicit mode - no auto-routing needed yet
  const strategy = V1_MODE_TO_STRATEGY[requestedMode] ?? 'local';
  const channelsPlanned = getV1ChannelsPlanned(requestedMode);
  const routingReason: RoutingReason = 'explicit-mode';

  return {
    selectedMode: strategy,
    routeFamily: 'entry',
    routingReason,
    fallbackApplied: strategy !== V1_MODE_TO_STRATEGY[requestedMode],
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned,
    channelsUsed: [], // Populated after recall execution
  };
}

/**
 * Select retrieval strategy for v2 (capsule-native) endpoint.
 *
 * v2 currently has no explicit mode field in the request contract,
 * so the router always chooses the capsule strategy.
 *
 * @param seed - The raw seed text (for future auto-routing extensions)
 * @returns RoutingDecision with selected strategy and trace metadata
 */
export function selectRetrievalStrategyV2(seed: string): RetrievalDecision {
  // v2 defaults to capsule-native retrieval
  const strategy: RetrievalStrategy = 'local';
  const routingReason: RoutingReason = 'v2-default-capsule';

  return {
    selectedMode: strategy,
    routeFamily: 'capsule',
    routingReason,
    fallbackApplied: false,
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned: ['capsule', 'profile'],
    channelsUsed: [], // Populated after recall execution
  };
}

/**
 * Convert a RetrievalDecision to a routing trace for RAG logging.
 * Strips channelsPlanned since the trace only needs actual channels used.
 */
export function toRoutingTrace(decision: RetrievalDecision) {
  return {
    selectedMode: decision.selectedMode,
    routeFamily: decision.routeFamily,
    routingReason: decision.routingReason,
    fallbackApplied: decision.fallbackApplied,
    fallbackTarget: decision.fallbackTarget,
    confidenceScore: decision.confidenceScore,
    confidenceBucket: decision.confidenceBucket,
    channelsUsed: decision.channelsUsed,
  };
}
