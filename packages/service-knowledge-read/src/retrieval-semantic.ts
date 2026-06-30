import type { RetrievalQuery } from '@trapmap/contracts';
import {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
} from '@trapmap/server/lib/cache/query-embedding-cache.js';
import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';

import { normalizeQuery } from './retrieval-keyword.js';
import type { RecallChannel } from './retrieval-orchestration.js';
import type { KnowledgeRecord } from './store.js';

export function buildEmbeddingText(entry: KnowledgeRecord): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}

export function computeLexicalIntentBoost(seed: string, entry: KnowledgeRecord): number {
  const queryTokens = normalizeQuery(seed);
  if (queryTokens.length === 0) return 0;

  const entryTokens = normalizeQuery(buildEmbeddingText(entry));
  if (entryTokens.length === 0) return 0;

  const overlapCount = queryTokens.filter((token) => entryTokens.includes(token)).length;
  if (overlapCount === 0) return 0;

  const ratio = overlapCount / queryTokens.length;
  const baseBoost = ratio >= 1 ? 0.55 : ratio * 0.3;
  return Math.min(0.55, baseBoost);
}

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

export function computeScore(
  similarity: number,
  entry: KnowledgeRecord,
  filters: RetrievalQuery['filters'],
  seed?: string,
): number {
  let score = Math.max(0, Math.min(1, similarity));

  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    const labelBoost = matchingLabels.length * 0.05;
    score = Math.min(1, score + labelBoost);
  }

  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    score = Math.min(1, score + 0.03);
  }

  if (seed) {
    const lexicalBoost = computeLexicalIntentBoost(seed, entry);
    score = Math.min(1, score + lexicalBoost);
  }

  return score;
}

export async function getEntryEmbedding(entry: KnowledgeRecord): Promise<number[]> {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    if (entry.embeddingCache?.vector) {
      return entry.embeddingCache.vector;
    }
  }

  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  const vector = await generateEmbedding(text);
  return vector;
}

export async function getQueryEmbedding(queryText: string): Promise<number[]> {
  const cached = getCachedQueryEmbedding(queryText);
  if (cached) {
    return cached;
  }

  const vector = await generateEmbedding(queryText);
  setCachedQueryEmbedding(queryText, vector);
  return vector;
}

interface BatchEmbeddingResult {
  vector: number[];
  fromCache: boolean;
}

interface BatchCacheStats {
  totalEntries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
}

interface OptimizedSemanticRecallResult {
  scoredEntries: Array<{ entry: KnowledgeRecord; score: number }>;
  cacheStats: BatchCacheStats;
}

function getCachedEmbedding(entry: KnowledgeRecord): number[] | null {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  if (
    entry.indexState?.vector?.status === 'synced' &&
    entry.indexState.vector.revision === entry.history.length &&
    entry.indexState.vector.contentHash === textHash
  ) {
    if (entry.embeddingCache?.vector) {
      return entry.embeddingCache.vector;
    }
  }

  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  return null;
}

export async function getBatchEmbeddings(
  entries: KnowledgeRecord[],
): Promise<{ embeddings: Map<string, BatchEmbeddingResult>; stats: BatchCacheStats }> {
  const embeddings = new Map<string, BatchEmbeddingResult>();
  const misses: KnowledgeRecord[] = [];

  for (const entry of entries) {
    const cached = getCachedEmbedding(entry);
    if (cached) {
      embeddings.set(entry.id, { vector: cached, fromCache: true });
    } else {
      misses.push(entry);
    }
  }

  if (misses.length > 0) {
    const computedVectors = await Promise.all(
      misses.map(async (entry) => {
        try {
          const text = buildEmbeddingText(entry);
          const vector = await generateEmbedding(text);
          return { entryId: entry.id, vector };
        } catch (_error) {
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

export async function optimizedSemanticRecall(
  queryVector: number[],
  entries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
  seed?: string,
): Promise<OptimizedSemanticRecallResult> {
  const { embeddings, stats } = await getBatchEmbeddings(entries);

  const scoredEntries: Array<{ entry: KnowledgeRecord; score: number }> = [];

  for (const entry of entries) {
    const embeddingResult = embeddings.get(entry.id);
    if (!embeddingResult) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, embeddingResult.vector);
    const score = computeScore(similarity, entry, filters, seed);
    scoredEntries.push({ entry, score });
  }

  scoredEntries.sort((a, b) => b.score - a.score);

  return { scoredEntries, cacheStats: stats };
}

export const semanticChannel: RecallChannel = {
  name: 'semantic',
  async recall(queryText: string, entries: KnowledgeRecord[]) {
    const queryVector = await getQueryEmbedding(queryText);
    const { scoredEntries } = await optimizedSemanticRecall(
      queryVector,
      entries,
      undefined as unknown as RetrievalQuery['filters'],
      queryText,
    );
    return scoredEntries.map(({ entry, score }) => ({
      entry,
      channel: 'semantic' as const,
      score,
      tokenMatches: [],
    }));
  },
};
