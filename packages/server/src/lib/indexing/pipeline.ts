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

import type { SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
import { normalizeKnowledgeIndexDocument } from './normalize.js';
import type {
  AdapterSyncState,
  IndexAdapter,
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
 * Initialize or update complete index state record.
 */
function initializeIndexState(
  normalizedDocument: NormalizedIndexDocument,
): KnowledgeIndexStateRecord {
  const vectorState = initializeAdapterState();
  const keywordState = initializeAdapterState();
  const graphState = initializeAdapterState();

  return {
    contentHash: normalizedDocument.contentHash,
    normalizedAt: normalizedDocument.normalizedAt,
    vector: vectorState,
    keyword: keywordState,
    graph: graphState,
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
 * @param adapters - Array of registered adapters
 * @returns Entry sync result
 */
export async function syncKnowledgeIndex(
  services: { store: SkillShareerStore; data: StoreData },
  entryId: string,
  adapters: IndexAdapter[],
): Promise<void> {
  const { store, data } = services;
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
        adapters.map((adapter) =>
          adapter.remove({
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
    entry.indexState = initializeIndexState(normalizedDocument);
  }

  // Sync to each adapter
  const adapterKinds = ['vector', 'keyword', 'graph'] as const;
  const adapterFailures: Array<{ kind: string; error: string }> = [];

  for (const adapter of adapters) {
    const adapterKind = adapter.kind;
    const currentState = entry.indexState[adapterKind];

    // Check if sync is needed
    if (!needsSync(currentState, normalizedDocument)) {
      continue; // Skip if already synced and unchanged
    }

    // Perform sync
    const result = await adapter.sync(normalizedDocument);

    // Update state
    entry.indexState[adapterKind] = updateAdapterState(currentState, normalizedDocument, result);

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
      const keywordAdapterState = entry.indexState[adapterKind] as KeywordAdapterSyncState;
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
 * Reconcile all knowledge entries to correct index state.
 *
 * This function:
 * - Syncs all approved entries that need it
 * - Removes index state for non-approved entries
 * - Repairs missing adapter state
 *
 * @param services - Store instance
 * @param adapters - Array of registered adapters
 * @returns Reconciliation result
 */
export async function reconcileKnowledgeIndexes(
  services: { store: SkillShareerStore },
  adapters: IndexAdapter[],
): Promise<ReconcileResult> {
  const startTime = Date.now();
  let entriesSynced = 0;
  let entriesRemoved = 0;
  let entriesSkipped = 0;

  await services.store.transact(async (data) => {
    const { knowledgeEntries } = data;

    for (const entry of knowledgeEntries) {
      const isApproved = entry.lifecycleState === 'approved';

      if (!isApproved) {
        // Remove index state for non-approved entries
        if (entry.indexState) {
          await Promise.all(
            adapters.map((adapter) =>
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
        entry.indexState = initializeIndexState(normalizedDocument);
        await syncKnowledgeIndex({ store: services.store, data }, entry.id, adapters);
        entriesSynced++;
        continue;
      }

      // Check if any adapter needs sync
      const needsAnySync =
        needsSync(entry.indexState.vector, normalizedDocument) ||
        needsSync(entry.indexState.keyword, normalizedDocument) ||
        needsSync(entry.indexState.graph, normalizedDocument);

      if (needsAnySync) {
        await syncKnowledgeIndex({ store: services.store, data }, entry.id, adapters);
        entriesSynced++;
      } else {
        entriesSkipped++;
      }
    }
  });

  const durationMs = Date.now() - startTime;

  return {
    totalEntries: entriesSynced + entriesRemoved + entriesSkipped,
    entriesSynced,
    entriesRemoved,
    entriesSkipped,
    durationMs,
  };
}
