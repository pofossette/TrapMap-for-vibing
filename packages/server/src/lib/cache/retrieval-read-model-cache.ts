import { RetrievalCache } from '@trapmap/server/lib/cache/retrieval-cache.js';
import {
  emitCacheInvalidation,
  registerCacheInvalidationListener,
  type CacheInvalidationEvent,
} from '@trapmap/server/lib/cache/invalidation.js';
import type { RetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';

const READ_MODEL_CACHE_KEY = 'retrieval-read-model:global';
const readModelCache = new RetrievalCache<RetrievalReadModel>({
  maxSize: 1,
  ttlMs: 60_000,
  namespace: 'retrieval-read-model',
});

let listenerRegistered = false;

function ensureInvalidationHook(): void {
  if (listenerRegistered) {
    return;
  }
  registerCacheInvalidationListener({
    invalidate(_event: CacheInvalidationEvent) {
      readModelCache.clear();
    },
  });
  listenerRegistered = true;
}

export function getCachedRetrievalReadModel(): RetrievalReadModel | null {
  ensureInvalidationHook();
  return readModelCache.get(READ_MODEL_CACHE_KEY);
}

export function setCachedRetrievalReadModel(model: RetrievalReadModel): void {
  ensureInvalidationHook();
  readModelCache.set(READ_MODEL_CACHE_KEY, model);
}

export function invalidateRetrievalReadModel(reason: CacheInvalidationEvent['reason']): void {
  emitCacheInvalidation({
    sourceType: 'trap',
    sourceId: 'global',
    reason,
  });
}

export function clearRetrievalReadModelCache(): void {
  readModelCache.clear();
}

export function resetRetrievalReadModelCacheForTests(): void {
  readModelCache.clear();
}
