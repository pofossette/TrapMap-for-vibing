/**
 * Index adapters for lifecycle-driven indexing.
 *
 * This module exports:
 * - Vector adapter: generates and persists embeddings
 * - Keyword adapter: persists normalized tokens
 * - PostgreSQL adapters: pgvector and keyword storage for scalability
 * - Helper functions for query-time token reuse
 * - Default adapter list for server bootstrap
 *
 * Adapters are registered with the pipeline and called during
 * lifecycle transitions (approval, update, deactivation).
 */

import type { Pool } from 'pg';
import type { IndexAdapter } from '../types.js';
import { graphIndexAdapter } from './graph.js';
import { keywordIndexAdapter } from './keyword.js';
import { createPgKeywordAdapter } from './pg-keyword.js';
import { createPgVectorAdapter } from './pg-vector.js';
import { vectorIndexAdapter } from './vector.js';

export {
  vectorIndexAdapter,
  upsertVectorIndex,
  removeVectorIndex,
  getVectorPayload,
  type VectorIndexPayload,
} from './vector.js';

export {
  keywordIndexAdapter,
  upsertKeywordIndex,
  removeKeywordIndex,
  getIndexedKeywordTokens,
  hasIndexedKeywordTokens,
  type KeywordIndexPayload,
} from './keyword.js';

export {
  graphIndexAdapter,
  clearGraphCache,
  getCachedGraphIndexDocuments,
  setCachedGraphIndexDocuments,
} from './graph.js';

// PostgreSQL pgvector adapters
export {
  createPgVectorAdapter,
  type PgVectorAdapterConfig,
} from './pg-vector.js';

export {
  createPgKeywordAdapter,
  type PgKeywordAdapterConfig,
} from './pg-keyword.js';

/**
 * Get the default index adapter list for server bootstrap.
 *
 * This function returns the standard set of adapters that should be
 * registered at server startup. The adapters are called in order during
 * lifecycle transitions.
 *
 * @returns Array of registered index adapters
 */
export function buildDefaultIndexAdapters(): IndexAdapter[] {
  return [vectorIndexAdapter, keywordIndexAdapter, graphIndexAdapter];
}

/**
 * Build hybrid adapters that support both in-memory and PostgreSQL storage.
 *
 * When a PostgreSQL pool is provided and feature flags are enabled,
 * uses PostgreSQL adapters for scalable indexing. Otherwise falls back
 * to in-memory adapters.
 *
 * @param pool - Optional PostgreSQL connection pool
 * @param featureFlags - Feature flag getters for PostgreSQL adapters
 * @returns Array of index adapters
 */
export function buildHybridIndexAdapters(config?: {
  pool?: Pool;
  usePgVector?: () => boolean;
  usePgKeyword?: () => boolean;
}): IndexAdapter[] {
  const { pool, usePgVector, usePgKeyword } = config ?? {};

  // If no pool, always use in-memory adapters
  if (!pool) {
    return buildDefaultIndexAdapters();
  }

  const adapters: IndexAdapter[] = [];

  // Vector adapter - use pgvector if enabled
  if (usePgVector) {
    adapters.push(createPgVectorAdapter({ pool, featureFlag: usePgVector }));
  } else {
    adapters.push(vectorIndexAdapter);
  }

  // Keyword adapter - use PostgreSQL if enabled
  if (usePgKeyword) {
    adapters.push(createPgKeywordAdapter({ pool, featureFlag: usePgKeyword }));
  } else {
    adapters.push(keywordIndexAdapter);
  }

  // Graph adapter - always in-memory for now
  adapters.push(graphIndexAdapter);

  return adapters;
}
