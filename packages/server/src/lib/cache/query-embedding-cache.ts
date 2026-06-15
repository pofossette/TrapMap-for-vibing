import { RetrievalCache } from '@trapmap/server/lib/cache/retrieval-cache.js';
import { normalizeQuery } from '@trapmap/server/lib/retrieval/recall/keyword.js';

const QUERY_EMBEDDING_CACHE_NAMESPACE = 'query-embedding';
const DEFAULT_QUERY_EMBEDDING_CACHE_MAX_SIZE = 300;
const DEFAULT_QUERY_EMBEDDING_CACHE_TTL_MS = 20 * 60_000;

let queryEmbeddingCache = createQueryEmbeddingCache();

function createQueryEmbeddingCache(options?: { maxSize?: number; ttlMs?: number }) {
  return new RetrievalCache<number[]>({
    maxSize: options?.maxSize ?? DEFAULT_QUERY_EMBEDDING_CACHE_MAX_SIZE,
    ttlMs: options?.ttlMs ?? DEFAULT_QUERY_EMBEDDING_CACHE_TTL_MS,
    namespace: QUERY_EMBEDDING_CACHE_NAMESPACE,
  });
}

export function buildQueryEmbeddingCacheKey(queryText: string): string {
  const normalized = normalizeQuery(queryText).join(' ');
  return normalized.length > 0 ? normalized : queryText.trim().toLowerCase();
}

export function getCachedQueryEmbedding(queryText: string): number[] | null {
  return queryEmbeddingCache.get(buildQueryEmbeddingCacheKey(queryText));
}

export function setCachedQueryEmbedding(queryText: string, vector: number[]): void {
  queryEmbeddingCache.set(buildQueryEmbeddingCacheKey(queryText), vector);
}

export function resetQueryEmbeddingCacheForTests(options?: {
  maxSize?: number;
  ttlMs?: number;
}): void {
  queryEmbeddingCache = createQueryEmbeddingCache(options);
}
