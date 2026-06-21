/**
 * Unified barrel export for all server package types.
 *
 * This file provides a single import point for all type definitions
 * across the server package, enabling cleaner imports and preparing
 * for potential future type-only package extraction.
 *
 * Usage:
 *   import type { KnowledgeRecord, UserRecord } from '../types.js';
 *
 * Backward compatibility: All existing import paths continue to work.
 * This file is additive, not replacing any existing module paths.
 */

// Store record types (system, knowledge, artifact, candidate, feedback)
export * from './store/enum-types/index.js';

// Store interfaces and utilities
export { type StoreData, type SkillShareerStore, JsonStore } from './store/index.js';
export {
  createEmptyStoreData,
  nowIso,
  hashSecret,
  createOpaqueToken,
  createSlug,
} from './store/index.js';

// State machines
export * from './state-machines/index.js';

// AI types
export * from './ai/types.js';

// Governance types
export * from './governance/types.js';

// Indexing types
export * from './indexing/types.js';

// Retrieval types
export * from './retrieval/types.js';

// Candidate types
export * from './candidates/types.js';

// Auth context
export type { ResolvedAuthContext } from './context.js';
