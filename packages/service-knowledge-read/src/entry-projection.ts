import type { KnowledgeEntryRecord, ReadModelProjectionStatus } from '@trapmap/backend-core';

import type {
  KnowledgeReadCacheInvalidationReason,
  KnowledgeReadProjectionCache,
} from './context.js';
import { getDefaultKnowledgeReadSupportInfra } from './knowledge-read-support-infra.js';

const ENTRY_PROJECTION_CACHE_KEY = 'knowledge-entry-projection:global';
const ENTRY_PROJECTION_CACHE_NAMESPACE = 'knowledge-entry-projection';

interface KnowledgeEntryProjectionSnapshot {
  entries: KnowledgeEntryRecord[];
  entriesById: Map<string, KnowledgeEntryRecord>;
}

export interface KnowledgeEntryProjectionRepo {
  listByFilter(
    filter: Record<string, never>,
    page?: { offset: number; limit: number },
  ): Promise<{ items: KnowledgeEntryRecord[]; total: number }>;
}

export interface KnowledgeEntryProjection {
  getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
  listMine(params: { userId: string; teamId?: string }): Promise<KnowledgeEntryRecord[]>;
  getStatus(): Promise<ReadModelProjectionStatus>;
  rebuild(): Promise<void>;
}

let listenerRegistered = false;
let entryProjectionCache: KnowledgeReadProjectionCache<KnowledgeEntryProjectionSnapshot> | null =
  null;
let lastRefreshedAt: string | null = null;
let invalidatedAt: number | null = null;

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

  const { items: entries } = await knowledgeRepo.listByFilter({});
  const snapshot = buildSnapshot(entries);
  getEntryProjectionCache().set(ENTRY_PROJECTION_CACHE_KEY, snapshot);
  lastRefreshedAt = new Date().toISOString();
  invalidatedAt = null;
  getDefaultKnowledgeReadSupportInfra().cache.recordStaleRecovery(ENTRY_PROJECTION_CACHE_NAMESPACE);
  return snapshot;
}

function projectionStatus(): ReadModelProjectionStatus {
  const hasSnapshot = getEntryProjectionCache().get(ENTRY_PROJECTION_CACHE_KEY) !== null;
  const refreshPending = !hasSnapshot || invalidatedAt !== null;
  return {
    phase: 'phase-2-boundary-closed',
    source: 'temporary-direct-backed-projection',
    consistency: 'eventual',
    freshness: refreshPending ? 'refresh-pending' : 'current',
    fallback: 'direct-authoritative-read',
    ...(lastRefreshedAt ? { lastRefreshedAt } : {}),
    ...(invalidatedAt !== null ? { lagMs: Date.now() - invalidatedAt } : {}),
    refreshTrigger: 'knowledge-write lifecycle invalidation',
    notes:
      'knowledge-read owns the snapshot cache; its current source is a temporary direct-backed projection until the outbox consumer persists an independent projection.',
    surfaces: [],
  };
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
    async getStatus() {
      return projectionStatus();
    },
    async rebuild() {
      getEntryProjectionCache().clear();
      await getOrBuildSnapshot(deps.knowledgeRepo);
    },
  };
}

export function invalidateKnowledgeEntryProjection(
  reason: KnowledgeReadCacheInvalidationReason,
): void {
  invalidatedAt = Date.now();
  getDefaultKnowledgeReadSupportInfra().cache.emitInvalidation(reason);
}

export function resetKnowledgeEntryProjectionCacheForTests(): void {
  getEntryProjectionCache().clear();
  lastRefreshedAt = null;
  invalidatedAt = null;
}
