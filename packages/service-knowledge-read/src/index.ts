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
export { searchKnowledge, updateEntryEmbeddingCache } from './search-knowledge.js';
