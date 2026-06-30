export {
  createKnowledgeReadDeps,
  createKnowledgeReadServiceModule,
  type KnowledgeReadDeps,
  type KnowledgeReadPortDeps,
} from './deps.js';
export { registerKnowledgeReadRoutes } from './routes.js';
export {
  createKnowledgeReadServer,
  type KnowledgeReadServer,
  type KnowledgeReadServiceConfig,
} from './server.js';
export {
  createKnowledgeReadChannelRegistry,
  createKnowledgeReadRetrievalQuery,
  createKnowledgeReadStrategyRegistry,
  type KnowledgeReadRetrievalQueryOptions,
} from './server-retrieval-seam.js';
export {
  ChannelRegistry,
  StrategyRegistry,
  type RecallChannel,
  type RetrievalStrategy,
} from './retrieval-orchestration.js';
export {
  keywordChannel,
  keywordRecall,
  normalizeQuery,
  tokenize,
} from './retrieval-keyword.js';
export { semanticChannel } from './retrieval-semantic.js';
export {
  dispatchByMode,
  getDbSearchConfig,
  graphAssistedRecall,
  hybridRecall,
  inferChannelsFromMerged,
  semanticRecall,
  type RecallExecutionResult,
} from './retrieval-recall-coordinator.js';
export { filterByBoundaryContext, filterEligibleEntries, isEntryEligible } from './filters.js';
export {
  type PipelineStep,
  type RagLogConfig,
  type RagLogEntry,
  generateQueryId,
  loadRagLogConfig,
  logRagRetrieval,
} from './rag-log.js';
export { buildRetrievalReadModel, type RetrievalReadModel } from './read-model.js';
export {
  assembleResponseBuckets,
  buildEmptyResponse,
  buildRetrievalResponse,
  toRetrievalMatch,
} from './response-assembly.js';
export { buildCitations } from './response-citations.js';
export { generateRefinement, isRefinementAvailable } from './response-refinement.js';
export { buildSummary } from './response-summary.js';
export { searchKnowledge, updateEntryEmbeddingCache } from './search-knowledge.js';
