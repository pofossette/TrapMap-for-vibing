/**
 * Retrieval orchestrator barrel: re-exports all pipeline entry points.
 *
 * Sub-modules:
 *   ./pipeline-timing.ts   — shared timedStep helper for RAG logging
 *   ./routing-trace.ts     — routing trace builder combining routing + recall graph data
 *   ./search-v1.ts         — entry-based retrieval pipeline (searchKnowledge)
 *   ./search-v2.ts         — capsule-native retrieval pipeline (searchKnowledgeV2)
 *   ./embedding-update.ts  — embedding cache update utility (updateEntryEmbeddingCache)
 *   ./routing.ts           — mode selection logic
 *   ./recall-coordinator.ts — mode dispatch and channel inference
 *   ./filters.ts           — eligibility and boundary context filters
 */

export { searchKnowledge } from './search-v1.js';
export { searchKnowledgeV2 } from './search-v2.js';
export { updateEntryEmbeddingCache } from './embedding-update.js';
