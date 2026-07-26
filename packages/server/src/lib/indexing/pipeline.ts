/**
 * Indexing pipeline for lifecycle-driven knowledge entry indexing.
 *
 * This module provides:
 * - syncKnowledgeIndex: sync a single entry to all adapters
 * - reconcileKnowledgeIndexes: reconcile all entries to correct state
 * - Idempotent operations with persisted state tracking
 *
 * Security: This module gates on lifecycleState === 'approved' before syncing.
 * Non-approved and deactivated entries have their index state removed.
 */

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { GraphIndexRepositoryPort, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
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
 * Sync a single knowledge entry to all registered adapters.
 *
 * This function:
 * - Normalizes the entry once into a canonical document
 * - Fans out to all adapters with the same document snapshot
 * - Persists sync metadata back onto the entry's indexState
 * - Only syncs approved entries; removes index state for non-approved/deactivated
 *
 * @param services - Store and data snapshot
 * @param entryId - ID of the entry to sync
 * @param registry - Adapter registry with all registered adapters
 * @returns Entry sync result
 */
export async function syncKnowledgeIndex(
  services: {
    store: SkillShareerStore;
    data: StoreData;
    ai?: { chat: ChatProvider };
    graphQueryBackend?: GraphQueryBackend;
    graphIndex?: GraphIndexRepositoryPort;
  },
  entryId: string,
  registry: AdapterRegistry,
): Promise<void> {
  const { store: _store, data, ai } = services;
  const entry = data.knowledgeEntries.find((e) => e.id === entryId);

  if (!entry) {
    throw new Error(`Entry ${entryId} not found`);
  }

  // Check lifecycle state
  const isApproved = entry.lifecycleState === 'approved';
  const isDeactivated = entry.lifecycleState === 'deactivated';

  if (isDeactivated || !isApproved) {
    // Remove index state for non-approved or deactivated entries
    if (entry.indexState) {
      // Remove from all adapters
      await Promise.all(
        registry.all().map((adapter) =>
          adapter === graphIndexAdapter
            ? graphIndexAdapter.remove(
                {
                  entryId: entry.id,
                  revision: entry.history?.length ?? 0,
                },
                undefined,
                services.graphQueryBackend,
                services.graphIndex,
              )
            : adapter.remove({
                entryId: entry.id,
                revision: entry.history?.length ?? 0, // Defensive: default to 0 if history is undefined
              }),
        ),
      );
      entry.indexState = null;
    }
    return;
  }

  // Entry is approved - sync to all adapters
  const normalizedDocument = normalizeKnowledgeIndexDocument(entry);

  // Initialize index state if needed
  if (!entry.indexState) {
    entry.indexState = initializeIndexState(normalizedDocument, registry);
  } else if (!entry.indexState.adapters) {
    // Migrate old-format indexState (vector/keyword/graph top-level) to new adapters map
    const old = entry.indexState as unknown as Record<string, AdapterSyncState>;
    const adapters: Record<string, AdapterSyncState> = {};
    for (const kind of registry.kinds()) {
      adapters[kind] = old[kind] ?? initializeAdapterState();
    }
    entry.indexState.adapters = adapters;
  }

  // Sync to each adapter
  const adapterFailures: Array<{ kind: string; error: string }> = [];

  for (const adapter of registry.all()) {
    const adapterKind = adapter.kind;
    const currentState = entry.indexState.adapters[adapterKind] ?? null;

    // Check if sync is needed
    if (!needsSync(currentState, normalizedDocument)) {
      continue; // Skip if already synced and unchanged
    }

    // Perform sync — graph adapter gets ChatProvider for LLM extraction
    const result =
      adapter === graphIndexAdapter
        ? await graphIndexAdapter.sync(
            normalizedDocument,
            services.store,
            ai?.chat,
            services.graphQueryBackend,
            data,
            services.graphIndex,
          )
        : await adapter.sync(normalizedDocument);

    // Update state — use current state or initialize if missing
    const baseState = currentState ?? initializeAdapterState();
    entry.indexState.adapters[adapterKind] = updateAdapterState(
      baseState,
      normalizedDocument,
      result,
    );

    // Track failures for logging
    if (!result.success) {
      adapterFailures.push({ kind: adapterKind, error: result.error ?? 'Unknown error' });
    }

    // Special handling for vector adapter: populate embeddingCache for backward compatibility
    if (adapterKind === 'vector' && result.success && result.payload) {
      // The vector adapter returns the generated vector in the payload
      // Populate the embedding cache for backward compatibility with semantic recall
      const vector = result.payload as number[];
      entry.embeddingCache = {
        textHash: normalizedDocument.contentHash,
        vector,
        createdAt: nowIso(),
        revision: normalizedDocument.revision,
      };
    }

    // Special handling for keyword adapter: persist the keyword state
    if (adapterKind === 'keyword' && result.success && result.payload) {
      // The keyword adapter returns the persisted keyword state in the payload
      // Store it in the index state for query-time reuse
      const keywordState = result.payload as {
        tokens: string[];
        fieldTokens: { shortcut: string[]; detail: string[]; labels: string[] };
      };
      const keywordAdapterState = entry.indexState.adapters[adapterKind] as KeywordAdapterSyncState;
      keywordAdapterState.persistedState = keywordState;
    }
  }

  // Log if any adapters failed
  if (adapterFailures.length > 0) {
    // Note: Partial sync occurred - some adapters may have succeeded while others failed
    // Consider implementing retry logic or marking entry for reconciliation
    console.warn(
      `[syncKnowledgeIndex] Entry ${entryId} had ${adapterFailures.length} adapter failure(s):`,
      adapterFailures,
    );
  }

  // Update normalized timestamp
  entry.indexState.normalizedAt = normalizedDocument.normalizedAt;
  entry.indexState.contentHash = normalizedDocument.contentHash;
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

/**
 * Reconcile all knowledge entries to correct index state.
 *
 * This function:
 * - Syncs all approved entries that need it
 * - Removes index state for non-approved entries
 * - Repairs missing adapter state
 * - Processes entries in batches to limit memory usage
 *
 * @param services - Store instance
 * @param registry - Adapter registry with all registered adapters
 * @param options - Optional configuration
 * @param options.batchSize - Number of entries to process per batch (default: 50)
 * @returns Reconciliation result
 */
export async function reconcileKnowledgeIndexes(
  services: { store: SkillShareerStore },
  registry: AdapterRegistry,
  options?: { batchSize?: number },
): Promise<ReconcileResult> {
  const startTime = Date.now();
  const batchSize = options?.batchSize ?? 50;
  const startMemory = process.memoryUsage();

  let entriesSynced = 0;
  let entriesRemoved = 0;
  let entriesSkipped = 0;
  let totalEntries = 0;

  await services.store.transact(async (data) => {
    const { knowledgeEntries } = data;
    totalEntries = knowledgeEntries.length;

    // Process entries in batches to limit memory usage
    for (let i = 0; i < knowledgeEntries.length; i += batchSize) {
      const batch = knowledgeEntries.slice(i, i + batchSize);

      for (const entry of batch) {
        const isApproved = entry.lifecycleState === 'approved';

        if (!isApproved) {
          // Remove index state for non-approved entries
          if (entry.indexState) {
            await Promise.all(
              registry.all().map((adapter) =>
                adapter.remove({
                  entryId: entry.id,
                  revision: entry.history?.length ?? 0, // Defensive: default to 0 if history is undefined
                }),
              ),
            );
            entry.indexState = null;
            entriesRemoved++;
          }
          continue;
        }

        // Entry is approved - check if sync is needed
        const normalizedDocument = normalizeKnowledgeIndexDocument(entry);

        if (!entry.indexState) {
          // No index state exists - needs full sync
          entry.indexState = initializeIndexState(normalizedDocument, registry);
          await syncKnowledgeIndex({ store: services.store, data }, entry.id, registry);
          entriesSynced++;
          continue;
        }

        // Check if any adapter needs sync
        const needsAnySync = registry
          .kinds()
          .some((kind) => needsSync(entry.indexState!.adapters[kind] ?? null, normalizedDocument));

        if (needsAnySync) {
          await syncKnowledgeIndex({ store: services.store, data }, entry.id, registry);
          entriesSynced++;
        } else {
          entriesSkipped++;
        }
      }

      // Memory optimization: hint garbage collection between batches
      // Only works if Node.js is run with --expose-gc flag
      if (global.gc) {
        global.gc();
      }
    }
  });

  const durationMs = Date.now() - startTime;
  const endMemory = process.memoryUsage();

  // Log memory usage for monitoring
  const heapUsedMB = Math.round(endMemory.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(endMemory.heapTotal / 1024 / 1024);
  const deltaMB = Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024);
  console.log(
    `[reconcileKnowledgeIndexes] Memory: ${heapUsedMB}MB used / ${heapTotalMB}MB total (delta: ${deltaMB >= 0 ? '+' : ''}${deltaMB}MB)`,
  );

  return {
    totalEntries,
    entriesSynced,
    entriesRemoved,
    entriesSkipped,
    durationMs,
  };
}
