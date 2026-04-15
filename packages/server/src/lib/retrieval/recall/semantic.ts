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

import type { RetrievalQuery } from '@skill-shareer/contracts';
import type { KnowledgeRecord } from '../../store.js';
import { generateEmbedding, hashEmbeddingText } from '../../embeddings.js';

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
 *
 * Phase 8: Prefers persisted indexState.vector for synced entries,
 * falls back to embeddingCache for legacy entries, then recomputes if necessary.
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
    // Use persisted vector from embeddingCache (mirrored by vector adapter)
    if (entry.embeddingCache?.embedding) {
      return entry.embeddingCache.embedding;
    }
  }

  // Fall back to legacy embeddingCache for entries without synced state
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
