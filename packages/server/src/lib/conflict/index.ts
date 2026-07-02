/**
 * Conflict detection and enrichment barrel.
 *
 * Re-exports the public API for conflict detection, LLM-based
 * conflict judgment, conflict enrichment for retrieval responses,
 * and the conflict repository.
 */

// Detection
export {
  detectConflicts,
  tokenize,
  overlapScore,
  classifyConflict,
  generateConflictContext,
} from './detect.js';
export type { ConflictDetectionInput } from './detect.js';

// LLM conflict judgment
export { judgeConflictWithLLM, parseConflictJudgmentResponse } from './llm-conflict.js';
export type { LlmConflictJudgment } from './llm-conflict.js';

// Enrichment
export {
  buildConflictLookup,
  conflictToHint,
  getConflictHints,
  enrichMatchesWithConflicts,
} from './enrich.js';

// Repository
export { createConflictRepository } from './repository.js';
export type { ConflictRepository } from './repository.js';
