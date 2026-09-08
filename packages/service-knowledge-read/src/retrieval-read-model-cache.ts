import type {
  KnowledgeReadCacheInvalidationReason,
  KnowledgeReadProjectionCache,
} from './context.js';
import { getDefaultKnowledgeReadSupportInfra } from './knowledge-read-support-infra.js';
import type { RetrievalReadModel } from './read-model.js';

const READ_MODEL_CACHE_KEY = 'retrieval-read-model:global';
const READ_MODEL_CACHE_NAMESPACE = 'retrieval-read-model';

/** Single-entry global read-model cache — size centralized, value unchanged. */
const READ_MODEL_CACHE_MAX_SIZE = 1;
const READ_MODEL_CACHE_TTL_MS = Number(process.env.TRAPMAP_RETRIEVAL_READMODEL_TTL_MS ?? 60_000);

let listenerRegistered = false;
let readModelCache: KnowledgeReadProjectionCache<RetrievalReadModel> | null = null;

function getReadModelCache() {
  if (!readModelCache) {
    readModelCache = getDefaultKnowledgeReadSupportInfra().cache.createRetrievalReadModelCache({
      maxSize: READ_MODEL_CACHE_MAX_SIZE,
      ttlMs: READ_MODEL_CACHE_TTL_MS,
      namespace: READ_MODEL_CACHE_NAMESPACE,
    });
  }

  return readModelCache;
}

function ensureInvalidationHook(): void {
  if (listenerRegistered) {
    return;
  }

  getDefaultKnowledgeReadSupportInfra().cache.registerInvalidationListener({
    namespaces: [READ_MODEL_CACHE_NAMESPACE],
    invalidate() {
      getReadModelCache().clear();
    },
  });
  listenerRegistered = true;
}

export function getCachedRetrievalReadModel(): RetrievalReadModel | null {
  ensureInvalidationHook();
  return getReadModelCache().get(READ_MODEL_CACHE_KEY);
}

export function setCachedRetrievalReadModel(model: RetrievalReadModel): void {
  ensureInvalidationHook();
  getReadModelCache().set(READ_MODEL_CACHE_KEY, model);
  getDefaultKnowledgeReadSupportInfra().cache.recordStaleRecovery(READ_MODEL_CACHE_NAMESPACE);
}

export function invalidateRetrievalReadModel(reason: KnowledgeReadCacheInvalidationReason): void {
  getDefaultKnowledgeReadSupportInfra().cache.emitInvalidation(reason);
}

export function clearRetrievalReadModelCache(): void {
  getReadModelCache().clear();
}

export function resetRetrievalReadModelCacheForTests(): void {
  getReadModelCache().clear();
}
