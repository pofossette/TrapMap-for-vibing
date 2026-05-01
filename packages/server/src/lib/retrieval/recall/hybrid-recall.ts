/**
 * Hybrid recall that routes between in-memory and PostgreSQL based on feature flags.
 *
 * This module provides:
 * - Unified recall interface for semantic and keyword channels
 * - Automatic routing based on feature flags
 * - Fallback to in-memory when PostgreSQL is unavailable
 */

import type { Pool } from 'pg';
import { getFeatureFlags } from '../../config/feature-flags.js';
import type { KnowledgeRecord } from '../../store.js';
import type { RecallCandidate } from '../types.js';
import { keywordRecall } from './keyword.js';
import { type KeywordRecallFilters, createPgKeywordRecall } from './pg-keyword.js';
import { type VectorRecallFilters, createPgVectorRecall } from './pg-vector.js';
import {
  computeScore,
  cosineSimilarity,
  getEntryEmbedding,
  getQueryEmbedding,
} from './semantic.js';

export interface HybridRecallConfig {
  /** PostgreSQL connection pool (optional, falls back to in-memory if not provided) */
  pool?: Pool;
}

/**
 * Create a hybrid semantic recall function.
 *
 * Routes to PostgreSQL pgvector when feature flag is enabled and pool is available.
 * Otherwise falls back to in-memory cosine similarity.
 */
export function createHybridSemanticRecall(config: HybridRecallConfig) {
  const pgVectorRecall = config.pool ? createPgVectorRecall({ pool: config.pool }) : null;

  return async function hybridSemanticRecall(
    queryText: string,
    eligibleEntries: KnowledgeRecord[],
    filters: VectorRecallFilters,
    maxResults: number,
  ): Promise<{ candidates: RecallCandidate[]; entryMap: Map<string, KnowledgeRecord> }> {
    const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));
    const flags = getFeatureFlags();

    // If pgvector recall is enabled and we have a pool, use PostgreSQL
    if (flags.usePgVectorRecall && pgVectorRecall) {
      const results = await pgVectorRecall(queryText, filters, maxResults);

      const candidates: RecallCandidate[] = results
        .filter((r) => entryMap.has(r.entryId))
        .map((r) => ({
          entry: entryMap.get(r.entryId)!,
          channel: 'semantic' as const,
          score: r.score,
          tokenMatches: [],
        }));

      return { candidates, entryMap };
    }

    // Fall back to in-memory recall
    const queryVector = await getQueryEmbedding(queryText);

    const candidates: RecallCandidate[] = await Promise.all(
      eligibleEntries.map(async (entry) => {
        const entryVector = await getEntryEmbedding(entry);
        const similarity = entryVector.length > 0 ? cosineSimilarity(queryVector, entryVector) : 0;
        const score = computeScore(similarity, entry, {
          labels: filters.labels,
          scopes: filters.scopes,
          teamId: filters.teamId ?? undefined,
          securityLevel: filters.securityLevel,
          isSystemAdmin: filters.isSystemAdmin,
        } as any);
        return {
          entry,
          channel: 'semantic' as const,
          score,
          tokenMatches: [],
        };
      }),
    );

    return {
      candidates: candidates.sort((a, b) => b.score - a.score).slice(0, maxResults),
      entryMap,
    };
  };
}

/**
 * Create a hybrid keyword recall function.
 *
 * Routes to PostgreSQL JSONB search when feature flag is enabled and pool is available.
 * Otherwise falls back to in-memory token matching.
 */
export function createHybridKeywordRecall(config: HybridRecallConfig) {
  const pgKeywordRecall = config.pool ? createPgKeywordRecall({ pool: config.pool }) : null;

  return async function hybridKeywordRecall(
    queryText: string,
    eligibleEntries: KnowledgeRecord[],
    filters: KeywordRecallFilters,
    maxResults: number,
  ): Promise<RecallCandidate[]> {
    const flags = getFeatureFlags();
    const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

    // If PostgreSQL recall is enabled and we have a pool
    if (flags.usePgKeywordRecall && pgKeywordRecall) {
      const results = await pgKeywordRecall(queryText, filters, maxResults);

      return results
        .filter((r) => entryMap.has(r.entryId))
        .map((r) => ({
          entry: entryMap.get(r.entryId)!,
          channel: 'keyword' as const,
          score: r.score,
          tokenMatches: r.tokenMatches,
        }));
    }

    // Fall back to in-memory
    return keywordRecall(queryText, eligibleEntries);
  };
}

/**
 * Combined recall result from both channels.
 */
export interface HybridRecallResult {
  semanticCandidates: RecallCandidate[];
  keywordCandidates: RecallCandidate[];
  entryMap: Map<string, KnowledgeRecord>;
}

/**
 * Create a combined hybrid recall function.
 *
 * Runs both semantic and keyword recall in parallel and returns combined results.
 */
export function createHybridRecall(config: HybridRecallConfig) {
  const hybridSemanticRecall = createHybridSemanticRecall(config);
  const hybridKeywordRecall = createHybridKeywordRecall(config);

  return async function hybridRecall(
    queryText: string,
    eligibleEntries: KnowledgeRecord[],
    filters: VectorRecallFilters & KeywordRecallFilters,
    maxResults: number,
  ): Promise<HybridRecallResult> {
    const [semanticResult, keywordCandidates] = await Promise.all([
      hybridSemanticRecall(queryText, eligibleEntries, filters, maxResults),
      hybridKeywordRecall(queryText, eligibleEntries, filters, maxResults),
    ]);

    return {
      semanticCandidates: semanticResult.candidates,
      keywordCandidates,
      entryMap: semanticResult.entryMap,
    };
  };
}
