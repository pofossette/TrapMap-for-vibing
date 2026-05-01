/**
 * Feature flags for incremental rollout of PostgreSQL-based retrieval.
 *
 * These flags control the migration from in-memory to PostgreSQL for:
 * - Index adapters (write path)
 * - Recall functions (read path)
 *
 * Flags can be toggled via environment variables without code changes.
 */

/**
 * Feature flags for retrieval infrastructure migration.
 */
export interface RetrievalFeatureFlags {
  /** Use PostgreSQL pgvector for embedding storage (write path) */
  usePgVectorIndex: boolean;
  /** Use PostgreSQL for keyword token storage (write path) */
  usePgKeywordIndex: boolean;
  /** Use PostgreSQL pgvector for semantic recall (read path) */
  usePgVectorRecall: boolean;
  /** Use PostgreSQL for keyword recall (read path) */
  usePgKeywordRecall: boolean;
}

/**
 * Environment variable names for feature flags.
 */
const ENV_VARS = {
  usePgVectorIndex: 'FEATURE_PG_VECTOR_INDEX',
  usePgKeywordIndex: 'FEATURE_PG_KEYWORD_INDEX',
  usePgVectorRecall: 'FEATURE_PG_VECTOR_RECALL',
  usePgKeywordRecall: 'FEATURE_PG_KEYWORD_RECALL',
} as const;

/**
 * Get current feature flags from environment variables.
 *
 * Flags are disabled by default for safe rollout.
 * Set env var to 'true' to enable.
 */
export function getFeatureFlags(): RetrievalFeatureFlags {
  return {
    usePgVectorIndex: process.env[ENV_VARS.usePgVectorIndex] === 'true',
    usePgKeywordIndex: process.env[ENV_VARS.usePgKeywordIndex] === 'true',
    usePgVectorRecall: process.env[ENV_VARS.usePgVectorRecall] === 'true',
    usePgKeywordRecall: process.env[ENV_VARS.usePgKeywordRecall] === 'true',
  };
}

/**
 * Check if any PostgreSQL feature is enabled.
 * Useful for deciding whether to initialize the pool.
 */
export function isAnyPgFeatureEnabled(): boolean {
  const flags = getFeatureFlags();
  return (
    flags.usePgVectorIndex ||
    flags.usePgKeywordIndex ||
    flags.usePgVectorRecall ||
    flags.usePgKeywordRecall
  );
}

/**
 * Check if all write-path features are enabled.
 * Useful for backfill operations.
 */
export function areAllWriteFeaturesEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.usePgVectorIndex && flags.usePgKeywordIndex;
}

/**
 * Check if all read-path features are enabled.
 * Useful for determining if full PostgreSQL recall is active.
 */
export function areAllReadFeaturesEnabled(): boolean {
  const flags = getFeatureFlags();
  return flags.usePgVectorRecall && flags.usePgKeywordRecall;
}
