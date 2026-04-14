/**
 * Retrieval module compatibility facade.
 *
 * This file re-exports the retrieval orchestrator functions to maintain
 * backward compatibility with existing imports. The actual implementation
 * has been moved to packages/server/src/lib/retrieval/orchestrator.ts
 *
 * Phase 6: Establishing the architectural seam for future RAG enhancements.
 * Phase 7+: Will extend the orchestrator with hybrid recall, reranking,
 *           and query mode support without changing this facade.
 */

export { searchKnowledge, updateEntryEmbeddingCache } from './retrieval/orchestrator.js';
