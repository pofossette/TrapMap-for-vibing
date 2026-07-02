/**
 * Retrieval orchestration barrel.
 *
 * Re-exports the public API of the orchestration sub-modules:
 * strategy/channel registries, recall coordination, filtering,
 * routing, pipeline timing, and the v1/v2 search entry points.
 */

// Registries
export { ChannelRegistry } from './channel-registry.js';
export type { RecallChannel } from './channel-registry.js';
export { StrategyRegistry } from './strategy-registry.js';
export type { RetrievalStrategy } from './strategy-registry.js';

// Recall coordination
export {
  dispatchByMode,
  semanticRecall,
  hybridRecall,
  graphAssistedRecall,
  computeSemanticCandidates,
  mergeCandidatesWithGraph,
  inferChannelsFromMerged,
  getDbSearchConfig,
  GRAPH_SCORE_BOOST_FACTOR,
} from './recall-coordinator.js';
export type {
  DbSearchConfig,
  GraphRecallTrace,
  RecallExecutionTrace,
  RecallExecutionResult,
} from './recall-coordinator.js';

// Orchestrator (thin facade over search-v1 / search-v2)
export { searchKnowledge } from './search-v1.js';
export { searchKnowledgeV2 } from './search-v2.js';
export { updateEntryEmbeddingCache } from './embedding-update.js';

// Filtering
export { filterEligibleEntries, filterByBoundaryContext } from './filters.js';

// Routing
export { selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace } from './routing.js';
export type { RetrievalDecision } from './routing.js';

// Routing trace
export { buildRoutingTrace } from './routing-trace.js';

// Pipeline timing
export { timedStep } from './pipeline-timing.js';
