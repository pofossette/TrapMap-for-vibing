/**
 * Indexing pipeline for lifecycle-driven knowledge entry indexing.
 *
 * This module provides:
 * - syncKnowledgeIndexFromOwner: sync a single entry from the owner projection
 * - reconcileKnowledgeIndexesFromOwner: reconcile all owner-local index state
 * - Idempotent operations with persisted state tracking
 *
 * Security: This module gates on lifecycleState === 'approved' before syncing.
 * Non-approved and deactivated entries have their index state removed.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type { GraphIndexRepositoryPort, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { graphIndexAdapter } from './adapters/graph.js';
import { normalizeKnowledgeIndexDocument } from './normalize.js';
import type { AdapterRegistry } from './registry.js';
import type {
  AdapterSyncState,
  IndexSyncResult,
  KeywordAdapterSyncState,
  KnowledgeIndexStateRecord,
  NormalizedIndexDocument,
  ReconcileResult,
} from './types.js';

/**
 * Initialize or update adapter sync state.
 */
function initializeAdapterState(): AdapterSyncState {
  return {
    status: 'pending',
    revision: 0,
    contentHash: '',
    lastSyncedAt: null,
    lastError: null,
  };
}

/**
 * Initialize complete index state record from registry.
 * Builds a dynamic adapters map keyed by each registered adapter's kind.
 */
function initializeIndexState(
  normalizedDocument: NormalizedIndexDocument,
  registry: AdapterRegistry,
): KnowledgeIndexStateRecord {
  const adapters: Record<string, AdapterSyncState> = {};
  for (const kind of registry.kinds()) {
    adapters[kind] = initializeAdapterState();
  }

  return {
    contentHash: normalizedDocument.contentHash,
    normalizedAt: normalizedDocument.normalizedAt,
    adapters,
  };
}

/**
 * Check if an adapter needs to sync based on current state.
 */
function needsSync(
  adapterState: AdapterSyncState | null,
  normalizedDocument: NormalizedIndexDocument,
): boolean {
  if (!adapterState) {
    return true; // No state exists, needs sync
  }

  // Check if content has changed
  if (adapterState.contentHash !== normalizedDocument.contentHash) {
    return true;
  }

  // Check if revision has changed
  if (adapterState.revision !== normalizedDocument.revision) {
    return true;
  }

  return false;
}

/**
 * Update adapter state after a sync attempt.
 */
function updateAdapterState(
  adapterState: AdapterSyncState,
  normalizedDocument: NormalizedIndexDocument,
  result: IndexSyncResult,
): AdapterSyncState {
  if (result.success) {
    return {
      status: 'synced',
      revision: normalizedDocument.revision,
      contentHash: normalizedDocument.contentHash,
      lastSyncedAt: nowIso(),
      lastError: null,
    };
  }

  // On failure, preserve previous state but record error
  return {
    ...adapterState,
    status: 'failed',
    lastError: result.error,
  };
}

type OwnerIndexingServices = {
  knowledgeOwner: Pick<KnowledgeOwnerPort, 'getIndexingEntry' | 'updateIndexMetadata'>;
  store: SkillShareerStore;
  ai?: { chat: ChatProvider };
  graphQueryBackend?: GraphQueryBackend;
  graphIndex?: GraphIndexRepositoryPort;
};

function requireGraphIndexOwner(services: OwnerIndexingServices): GraphIndexRepositoryPort {
  if (!services.graphIndex) {
    throw new Error('Graph index owner is required for owner-local indexing');
  }
  return services.graphIndex;
}

async function removeOwnerIndexAdapters(
  services: OwnerIndexingServices,
  registry: AdapterRegistry,
  entryId: string,
  revision: number,
): Promise<void> {
  const ref = { entryId, revision };
  await Promise.all(
    registry
      .all()
      .map((adapter) =>
        adapter === graphIndexAdapter
          ? graphIndexAdapter.remove(
              ref,
              undefined,
              services.graphQueryBackend,
              requireGraphIndexOwner(services),
            )
          : adapter.remove(ref),
      ),
  );
}

async function syncOwnerAdapter(
  services: OwnerIndexingServices,
  adapter: ReturnType<AdapterRegistry['all']>[number],
  document: NormalizedIndexDocument,
): Promise<IndexSyncResult> {
  if (adapter !== graphIndexAdapter) return adapter.sync(document);
  return graphIndexAdapter.sync(
    document,
    undefined,
    services.ai?.chat,
    services.graphQueryBackend,
    undefined,
    requireGraphIndexOwner(services),
  );
}

/**
 * Synchronize a knowledge entry from the authoritative knowledge-write owner.
 *
 * Index adapters remain projection consumers: source reads and metadata
 * checkpoints are owner-port calls, never compatibility-store transactions.
 */
export async function syncKnowledgeIndexFromOwner(
  services: OwnerIndexingServices,
  entryId: string,
  registry: AdapterRegistry,
): Promise<void> {
  const entry = await services.knowledgeOwner.getIndexingEntry(entryId);
  if (!entry) {
    throw new Error(`Entry ${entryId} not found`);
  }

  if (entry.lifecycleState !== 'approved') {
    if (entry.indexState) {
      await removeOwnerIndexAdapters(services, registry, entry.id, entry.revision);
    }
    await services.knowledgeOwner.updateIndexMetadata(entry.id, {
      indexState: null,
      embeddingCache: null,
    });
    return;
  }

  const normalizedDocument = normalizeKnowledgeIndexDocument(entry);
  const indexState = entry.indexState
    ? ({ ...entry.indexState } as KnowledgeIndexStateRecord)
    : initializeIndexState(normalizedDocument, registry);
  if (!indexState.adapters) {
    const legacyState = indexState as unknown as Record<string, AdapterSyncState>;
    indexState.adapters = {};
    for (const kind of registry.kinds()) {
      indexState.adapters[kind] = legacyState[kind] ?? initializeAdapterState();
    }
  }

  let embeddingCache = entry.embeddingCache;
  const adapterFailures: Array<{ kind: string; error: string }> = [];
  for (const adapter of registry.all()) {
    const currentState = indexState.adapters[adapter.kind] ?? null;
    if (!needsSync(currentState, normalizedDocument)) continue;

    const result = await syncOwnerAdapter(services, adapter, normalizedDocument);

    indexState.adapters[adapter.kind] = updateAdapterState(
      currentState ?? initializeAdapterState(),
      normalizedDocument,
      result,
    );
    if (!result.success) {
      adapterFailures.push({ kind: adapter.kind, error: result.error ?? 'Unknown error' });
    }
    if (adapter.kind === 'vector' && result.success && result.payload) {
      embeddingCache = {
        textHash: normalizedDocument.contentHash,
        vector: result.payload as number[],
        createdAt: nowIso(),
        revision: normalizedDocument.revision,
      };
    }
    if (adapter.kind === 'keyword' && result.success && result.payload) {
      (indexState.adapters[adapter.kind] as KeywordAdapterSyncState).persistedState =
        result.payload as {
          tokens: string[];
          fieldTokens: { shortcut: string[]; detail: string[]; labels: string[] };
        };
    }
  }

  if (adapterFailures.length > 0) {
    console.warn(
      `[syncKnowledgeIndexFromOwner] Entry ${entryId} had ${adapterFailures.length} adapter failure(s):`,
      adapterFailures,
    );
  }
  indexState.normalizedAt = normalizedDocument.normalizedAt;
  indexState.contentHash = normalizedDocument.contentHash;
  await services.knowledgeOwner.updateIndexMetadata(entry.id, { indexState, embeddingCache });
}

/** Reconcile owner-local indexing metadata without reading compatibility state. */
export async function reconcileKnowledgeIndexesFromOwner(
  services: OwnerIndexingServices & {
    knowledgeOwner: Pick<
      KnowledgeOwnerPort,
      'getIndexingEntry' | 'listIndexingEntries' | 'updateIndexMetadata'
    >;
  },
  registry: AdapterRegistry,
  options?: { batchSize?: number },
): Promise<ReconcileResult> {
  const startTime = Date.now();
  const batchSize = options?.batchSize ?? 50;
  let offset = 0;
  let totalEntries = 0;
  let entriesSynced = 0;
  let entriesRemoved = 0;
  let entriesSkipped = 0;

  while (true) {
    const page = await services.knowledgeOwner.listIndexingEntries({ offset, limit: batchSize });
    totalEntries += page.entries.length;
    for (const entry of page.entries) {
      if (entry.lifecycleState !== 'approved') {
        if (entry.indexState) entriesRemoved++;
        else entriesSkipped++;
        await syncKnowledgeIndexFromOwner(services, entry.id, registry);
        continue;
      }

      const document = normalizeKnowledgeIndexDocument(entry);
      const state = entry.indexState as KnowledgeIndexStateRecord | null;
      const needsIndexSync =
        !state ||
        !state.adapters ||
        registry.kinds().some((kind) => needsSync(state.adapters[kind] ?? null, document));
      if (needsIndexSync) entriesSynced++;
      else entriesSkipped++;
      await syncKnowledgeIndexFromOwner(services, entry.id, registry);
    }
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }

  return {
    totalEntries,
    entriesSynced,
    entriesRemoved,
    entriesSkipped,
    durationMs: Date.now() - startTime,
  };
}
