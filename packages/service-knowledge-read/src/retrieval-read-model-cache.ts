import {
  type CacheInvalidationEvent,
  createCacheInvalidationEvent,
  emitCacheInvalidation,
  recordCacheStaleRecovery,
  registerCacheInvalidationListener,
} from '@trapmap/server/lib/cache/invalidation.js';
import { RetrievalCache } from '@trapmap/server/lib/cache/retrieval-cache.js';

import type { RetrievalReadModel } from './read-model.js';

const READ_MODEL_CACHE_KEY = 'retrieval-read-model:global';
const READ_MODEL_CACHE_NAMESPACE = 'retrieval-read-model';
const readModelCache = new RetrievalCache<RetrievalReadModel>({
  maxSize: 1,
  ttlMs: 60_000,
  namespace: READ_MODEL_CACHE_NAMESPACE,
});

let listenerRegistered = false;

function ensureInvalidationHook(): void {
  if (listenerRegistered) {
    return;
  }
  registerCacheInvalidationListener({
    namespaces: [READ_MODEL_CACHE_NAMESPACE],
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
  recordCacheStaleRecovery(READ_MODEL_CACHE_NAMESPACE);
}

export function invalidateRetrievalReadModel(reason: CacheInvalidationEvent['reason']): void {
  emitCacheInvalidation(
    createCacheInvalidationEvent({
      sourceType: 'trap',
      sourceId: 'global',
      reason,
      owner: 'knowledge-lifecycle-projection',
      trigger: 'operator-request',
    }),
  );
}

export function clearRetrievalReadModelCache(): void {
  readModelCache.clear();
}

export function resetRetrievalReadModelCacheForTests(): void {
  readModelCache.clear();
}
