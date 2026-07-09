import type { KnowledgeEntryRecord } from '@trapmap/backend-core';

import type {
  KnowledgeReadCacheInvalidationReason,
  KnowledgeReadProjectionCache,
} from './context.js';
import { getDefaultKnowledgeReadSupportInfra } from './knowledge-read-support-infra.js';

const ENTRY_PROJECTION_CACHE_KEY = 'knowledge-entry-projection:global';
const ENTRY_PROJECTION_CACHE_NAMESPACE = 'knowledge-entry-projection';

export interface KnowledgeEntryProjectionSnapshot {
  entries: KnowledgeEntryRecord[];
  entriesById: Map<string, KnowledgeEntryRecord>;
}

export interface KnowledgeEntryProjectionRepo {
  listByFilter(filter: Record<string, never>): Promise<KnowledgeEntryRecord[]>;
}

export interface KnowledgeEntryProjection {
  getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
  listMine(params: { userId: string; teamId?: string }): Promise<KnowledgeEntryRecord[]>;
}

let listenerRegistered = false;
let entryProjectionCache: KnowledgeReadProjectionCache<KnowledgeEntryProjectionSnapshot> | null =
  null;

function getEntryProjectionCache() {
  if (!entryProjectionCache) {
    entryProjectionCache =
      getDefaultKnowledgeReadSupportInfra().cache.createRetrievalReadModelCache({
        maxSize: 1,
        ttlMs: 60_000,
        namespace: ENTRY_PROJECTION_CACHE_NAMESPACE,
      });
  }

  return entryProjectionCache;
}

function ensureInvalidationHook(): void {
  if (listenerRegistered) {
    return;
  }

  getDefaultKnowledgeReadSupportInfra().cache.registerInvalidationListener({
    namespaces: [ENTRY_PROJECTION_CACHE_NAMESPACE],
    invalidate() {
      getEntryProjectionCache().clear();
    },
  });
  listenerRegistered = true;
}

function normalizeEntry(entry: KnowledgeEntryRecord): KnowledgeEntryRecord {
  return { ...entry };
}

function buildSnapshot(entries: KnowledgeEntryRecord[]): KnowledgeEntryProjectionSnapshot {
  const normalizedEntries = entries.map(normalizeEntry);
  return {
    entries: normalizedEntries,
    entriesById: new Map(normalizedEntries.map((entry) => [entry.id, entry])),
  };
}

async function getOrBuildSnapshot(
  knowledgeRepo: KnowledgeEntryProjectionRepo,
): Promise<KnowledgeEntryProjectionSnapshot> {
  ensureInvalidationHook();

  const cached = getEntryProjectionCache().get(ENTRY_PROJECTION_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const entries = await knowledgeRepo.listByFilter({});
  const snapshot = buildSnapshot(entries);
  getEntryProjectionCache().set(ENTRY_PROJECTION_CACHE_KEY, snapshot);
  getDefaultKnowledgeReadSupportInfra().cache.recordStaleRecovery(ENTRY_PROJECTION_CACHE_NAMESPACE);
  return snapshot;
}

export function createKnowledgeEntryProjection(deps: {
  knowledgeRepo: KnowledgeEntryProjectionRepo;
}): KnowledgeEntryProjection {
  return {
    async getById(entryId) {
      const snapshot = await getOrBuildSnapshot(deps.knowledgeRepo);
      return snapshot.entriesById.get(entryId) ?? null;
    },
    async listMine(params) {
      const snapshot = await getOrBuildSnapshot(deps.knowledgeRepo);
      return snapshot.entries.filter((entry) => {
        if (entry.ownerUserId !== params.userId) {
          return false;
        }

        return params.teamId === undefined || entry.teamId === params.teamId;
      });
    },
  };
}

export function invalidateKnowledgeEntryProjection(
  reason: KnowledgeReadCacheInvalidationReason,
): void {
  getDefaultKnowledgeReadSupportInfra().cache.emitInvalidation(reason);
}

export function resetKnowledgeEntryProjectionCacheForTests(): void {
  getEntryProjectionCache().clear();
}
