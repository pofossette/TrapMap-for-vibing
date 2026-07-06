/**
 * Barrel re-export for the graph-lite indexing module.
 *
 * Consolidates public API from documents, graphology, store, llm-cache,
 * and llm-extract so external consumers can import from a single entry point.
 */

// ---------------------------------------------------------------------------
// Documents — types and builders
// ---------------------------------------------------------------------------

export type {
  GraphNodeKind,
  GraphRelationType,
  GraphRelationStrength,
  GraphNodeRecord,
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  TrapGraphDocumentInput,
  SkillGraphDocumentInput,
} from './documents.js';
export {
  buildTrapGraphDocument,
  buildSkillGraphDocument,
} from './documents.js';

// ---------------------------------------------------------------------------
// Graphology — graph assembly, validation, and expansion
// ---------------------------------------------------------------------------

export type {
  Graph,
  GraphRuntimeSnapshot,
  LocalExpansionParams,
} from './graphology.js';
export {
  buildGraphRuntimeSnapshot,
  expandSourcesOneHop,
  calculateSourceRelationStrength,
  assertNoHardDependencyCycles,
  buildLocalExpansionView,
} from './graphology.js';

// ---------------------------------------------------------------------------
// Store — durable graph document persistence helpers
// ---------------------------------------------------------------------------

export {
  upsertGraphIndexDocument,
  removeGraphIndexDocumentsForSource,
  getGraphIndexDocuments,
} from './store.js';

// ---------------------------------------------------------------------------
// LLM cache — SHA-256 keyed extraction cache
// ---------------------------------------------------------------------------

export { PROMPT_VERSION, LlmExtractionCache } from './llm-cache.js';

// ---------------------------------------------------------------------------
// LLM extract — two-phase orchestrator and sub-module re-exports
// ---------------------------------------------------------------------------

export type {
  LlmExtractionResult,
  ExtractGraphOptions,
} from './llm-extract.js';
export {
  normalizeValue,
  mergeExtractions,
  toGraphRecords,
  planExtraction,
  extractGraphEntitiesWithLLM,
} from './llm-extract.js';
