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
import { AdapterRegistry } from '../registry.js';
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
 * Build the default adapter registry for server bootstrap.
 *
 * Registers vector, keyword, and graph adapters in standard order.
 *
 * @returns AdapterRegistry with default adapters
 */
export function buildDefaultAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(vectorIndexAdapter);
  registry.register(keywordIndexAdapter);
  registry.register(graphIndexAdapter);
  return registry;
}

/**
 * Build a hybrid adapter registry that supports both in-memory and PostgreSQL storage.
 *
 * When a PostgreSQL pool is provided and feature flags are enabled,
 * uses PostgreSQL adapters for scalable indexing. Otherwise falls back
 * to in-memory adapters.
 *
 * @param pool - Optional PostgreSQL connection pool
 * @param featureFlags - Feature flag getters for PostgreSQL adapters
 * @returns AdapterRegistry with hybrid adapters
 */
export function buildHybridAdapterRegistry(config?: {
  pool?: Pool;
  usePgVector?: () => boolean;
  usePgKeyword?: () => boolean;
}): AdapterRegistry {
  const { pool, usePgVector, usePgKeyword } = config ?? {};

  // If no pool, always use in-memory adapters
  if (!pool) {
    return buildDefaultAdapterRegistry();
  }

  const registry = new AdapterRegistry();

  // Vector adapter - use pgvector if enabled
  if (usePgVector) {
    registry.register(createPgVectorAdapter({ pool, featureFlag: usePgVector }));
  } else {
    registry.register(vectorIndexAdapter);
  }

  // Keyword adapter - use PostgreSQL if enabled
  if (usePgKeyword) {
    registry.register(createPgKeywordAdapter({ pool, featureFlag: usePgKeyword }));
  } else {
    registry.register(keywordIndexAdapter);
  }

  // Graph adapter - always in-memory for now
  registry.register(graphIndexAdapter);

  return registry;
}

/**
 * @deprecated Use buildDefaultAdapterRegistry() instead.
 * Get the default index adapter list for server bootstrap.
 */
export function buildDefaultIndexAdapters(): IndexAdapter[] {
  return [vectorIndexAdapter, keywordIndexAdapter, graphIndexAdapter];
}
