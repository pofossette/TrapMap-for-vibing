/**
 * Semantic recall adapter using embedding-based retrieval.
 *
 * This module handles:
 * - Building embedding text from knowledge entries
 * - Computing cosine similarity between query and entry vectors
 * - Computing relevance scores with metadata-aware boosts
 * - Getting or computing embeddings with cache support
 *
 * This is the current (and default) recall path. Future phases will add
 * keyword recall, graph-assisted recall, and hybrid merging.
 */

import type { RetrievalQuery } from '@trapmap/contracts';
import { generateEmbedding, hashEmbeddingText } from '../../embeddings.js';
import type { KnowledgeRecord } from '../../store.js';
import type { RecallChannel } from '../channel-registry.js';

/**
 * Build the embedding text from a knowledge entry.
 * Uses shortcut, detail, and labels - excludes images, attachments, and review metadata.
 */
export function buildEmbeddingText(entry: KnowledgeRecord): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    magnitudeA += ai * ai;
    magnitudeB += bi * bi;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Compute relevance score with metadata-aware boosts.
 * Base score is embedding similarity, boosted by exact label/scope matches.
 */
export function computeScore(
  similarity: number,
  entry: KnowledgeRecord,
  filters: RetrievalQuery['filters'],
): number {
  // Clamp similarity to [0, 1] range first
  let score = Math.max(0, Math.min(1, similarity));

  // Boost for exact label matches
  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    const labelBoost = matchingLabels.length * 0.05; // Small boost per matching label
    score = Math.min(1, score + labelBoost);
  }

  // Boost for exact scope match
  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    score = Math.min(1, score + 0.03);
  }

  return score;
}

/**
 * Get or compute embedding vector for a knowledge entry.
 * Uses persisted indexState.vector if available (Phase 8), falls back to
 * embeddingCache for compatibility, then recomputes if necessary.
 */
export async function getEntryEmbedding(entry: KnowledgeRecord): Promise<number[]> {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  // Phase 8: Prefer persisted indexState.vector for synced entries
  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    // Use persisted vector from indexState
    if (entry.embeddingCache?.vector) {
      return entry.embeddingCache.vector;
    }
  }

  // Fall back to embeddingCache for legacy entries
  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  // Cache miss or outdated - compute new embedding
  const vector = await generateEmbedding(text);

  // Note: We don't update the cache here because we're working with a snapshot
  // The cache would be updated when the entry is modified or approved
  return vector;
}

/**
 * Generate embedding vector for a query text.
 */
export async function getQueryEmbedding(queryText: string): Promise<number[]> {
  return generateEmbedding(queryText);
}

// =============================================================================
// Batch Embedding Optimization (Phase 72-02)
// =============================================================================

/**
 * Result of batch embedding retrieval for a single entry.
 */
interface BatchEmbeddingResult {
  vector: number[];
  fromCache: boolean;
}

/**
 * Cache hit rate statistics for a batch embedding operation.
 */
interface BatchCacheStats {
  totalEntries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

/**
 * Result of the optimized semantic recall operation.
 */
interface OptimizedSemanticRecallResult {
  scoredEntries: Array<{ entry: KnowledgeRecord; score: number }>;
  cacheStats: BatchCacheStats;
}

/**
 * Check whether an entry has a valid cached embedding.
 * Returns the cached vector if available and fresh, otherwise null.
 *
 * This is the same logic as getEntryEmbedding() but non-async — it only
 * checks caches and returns null on miss instead of computing.
 */
function getCachedEmbedding(entry: KnowledgeRecord): number[] | null {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  // Prefer persisted indexState.vector for synced entries
  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    if (entry.embeddingCache?.vector) {
      return entry.embeddingCache.vector;
    }
  }

  // Fall back to embeddingCache for legacy entries
  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  return null;
}

/**
 * Batch fetch embeddings for multiple entries.
 *
 * For entries with cached vectors (indexState synced or embeddingCache fresh),
 * returns the cached vector immediately. For cache misses, computes embeddings
 * in parallel and returns them.
 *
 * This reduces per-query overhead from O(n) individual cache lookups to
 * O(n) fast synchronous checks + O(miss_count) async computations.
 *
 * @param entries - Array of knowledge entries to fetch embeddings for
 * @returns Map of entry ID to embedding result with cache hit tracking
 */
export async function getBatchEmbeddings(
  entries: KnowledgeRecord[],
): Promise<{ embeddings: Map<string, BatchEmbeddingResult>; stats: BatchCacheStats }> {
  const embeddings = new Map<string, BatchEmbeddingResult>();
  const misses: KnowledgeRecord[] = [];

  // Phase 1: Synchronous cache check for all entries
  for (const entry of entries) {
    const cached = getCachedEmbedding(entry);
    if (cached) {
      embeddings.set(entry.id, { vector: cached, fromCache: true });
    } else {
      misses.push(entry);
    }
  }

  // Phase 2: Compute embeddings only for cache misses
  if (misses.length > 0) {
    const computedVectors = await Promise.all(
      misses.map(async (entry) => {
        try {
          const text = buildEmbeddingText(entry);
          const vector = await generateEmbedding(text);
          return { entryId: entry.id, vector };
        } catch (error) {
          console.error(`Failed to compute embedding for entry ${entry.id}:`, error);
          return { entryId: entry.id, vector: null };
        }
      }),
    );

    for (const result of computedVectors) {
      if (result.vector) {
        embeddings.set(result.entryId, { vector: result.vector, fromCache: false });
      }
    }
  }

  const actualCacheHits = entries.length - misses.length;
  const totalEntries = entries.length;
  const stats: BatchCacheStats = {
    totalEntries,
    cacheHits: actualCacheHits,
    cacheMisses: misses.length,
    hitRate: totalEntries > 0 ? actualCacheHits / totalEntries : 0,
  };

  return { embeddings, stats };
}

/**
 * Optimized semantic recall using batch embedding retrieval.
 *
 * Instead of calling getEntryEmbedding() for each entry individually,
 * this function:
 * 1. Fetches all cached embeddings in one synchronous pass
 * 2. Computes embeddings only for cache misses in parallel
 * 3. Computes similarity scores for all entries
 *
 * @param queryVector - Pre-computed query embedding vector
 * @param entries - Eligible knowledge entries to search
 * @param filters - Query filters for score boosting
 * @returns Scored entries sorted by score descending, plus cache statistics
 */
export async function optimizedSemanticRecall(
  queryVector: number[],
  entries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
): Promise<OptimizedSemanticRecallResult> {
  const { embeddings, stats } = await getBatchEmbeddings(entries);

  const scoredEntries: Array<{ entry: KnowledgeRecord; score: number }> = [];

  for (const entry of entries) {
    const embeddingResult = embeddings.get(entry.id);
    if (!embeddingResult) {
      // Skip entries where embedding computation failed
      continue;
    }

    const similarity = cosineSimilarity(queryVector, embeddingResult.vector);
    const score = computeScore(similarity, entry, filters);
    scoredEntries.push({ entry, score });
  }

  // Sort by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  return { scoredEntries, cacheStats: stats };
}

/**
 * Semantic recall channel implementation.
 * Wraps optimizedSemanticRecall as a RecallChannel.
 */
export const semanticChannel: RecallChannel = {
  name: 'semantic',
  async recall(queryText: string, entries: KnowledgeRecord[]) {
    const queryVector = await getQueryEmbedding(queryText);
    const { scoredEntries } = await optimizedSemanticRecall(
      queryVector,
      entries,
      undefined as unknown as RetrievalQuery['filters'],
    );
    return scoredEntries.map(({ entry, score }) => ({
      entry,
      channel: 'semantic' as const,
      score,
      tokenMatches: [],
    }));
  },
};
