export { searchKnowledge, searchKnowledgeV2, updateEntryEmbeddingCache } from './orchestrator.js';
export {
  dispatchByMode,
  inferChannelsFromMerged,
  semanticRecall,
  hybridRecall,
  graphAssistedRecall,
  computeSemanticCandidates,
  mergeCandidatesWithGraph,
  getDbSearchConfig,
} from './recall-coordinator.js';
export { selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace } from './routing.js';
export { StrategyRegistry } from './strategy-registry.js';
export type { RetrievalStrategy } from './strategy-registry.js';
export { ChannelRegistry } from './channel-registry.js';
export type { RecallChannel } from './channel-registry.js';
export { filterEligibleEntries, filterByBoundaryContext } from './filters.js';
