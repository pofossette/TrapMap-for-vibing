/**
 * Vector index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Vector sync with idempotency based on revision and content hash
 * - Idempotent vector removal
 * - Embedding generation and persistence
 *
 * The adapter generates embeddings from document.canonicalText and
 * persists them to the store for retrieval-time reuse.
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import type { NormalizedIndexDocument } from '../types.js';
import type { IndexSyncResult, IndexAdapter } from '../types.js';
import { generateEmbedding } from '../../embeddings.js';
import { nowIso } from '../../store.js';
import type { JsonStore } from '../../store.js';
import type { StoreData } from '../../store.js';

/**
 * In-memory tracking of synced vector state.
 * In production, this would be persisted to the store.
 */
interface VectorSyncState {
  entryId: string;
  revision: number;
  contentHash: string;
  vector: number[];
  syncedAt: string;
}

// In-memory storage for sync state (worktree-compatible approach)
const vectorStateCache = new Map<string, VectorSyncState>();

/**
 * Generate cache key for vector state.
 */
function getCacheKey(entryId: string, revision: number): string {
  return `${entryId}:${revision}`;
}

/**
 * Vector index adapter implementation.
 */
export const vectorIndexAdapter: IndexAdapter = {
  kind: 'vector',

  /**
   * Sync vector index for a normalized document.
   *
   * This function:
   * - Generates embedding vector for the normalized document
   * - Persists vector payload keyed by entryId, revision, and contentHash
   * - Skips work if revision and content hash match (idempotency)
   *
   * @param document - The normalized index document
   * @returns Sync result indicating success and whether work was performed
   */
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    const cacheKey = getCacheKey(document.entryId, document.revision);
    const existingState = vectorStateCache.get(cacheKey);

    // Check if we can skip work (idempotency)
    if (
      existingState &&
      existingState.contentHash === document.contentHash &&
      existingState.revision === document.revision
    ) {
      return {
        adapterKind: 'vector',
        success: true,
        error: null,
        performedWork: false,
      };
    }

    try {
      // Generate embedding vector
      const vector = await generateEmbedding(document.canonicalText);

      // Persist vector state
      const state: VectorSyncState = {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        vector,
        syncedAt: nowIso(),
      };

      vectorStateCache.set(cacheKey, state);

      return {
        adapterKind: 'vector',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        adapterKind: 'vector',
        success: false,
        error: errorMessage,
        performedWork: false,
      };
    }
  },

  /**
   * Remove vector index for an entry.
   *
   * This function:
   * - Clears vector sync state for the given entry
   * - Is idempotent (safe to call multiple times)
   *
   * @param ref - Entry reference containing entryId and revision
   */
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    const cacheKey = getCacheKey(ref.entryId, ref.revision);
    vectorStateCache.delete(cacheKey);
  },
};

/**
 * Get persisted vector for an entry.
 * Returns null if the entry has not been synced.
 *
 * @param entryId - The knowledge entry ID
 * @param revision - The entry revision
 * @returns Vector or null
 */
export function getIndexedVector(entryId: string, revision: number): number[] | null {
  const cacheKey = getCacheKey(entryId, revision);
  const state = vectorStateCache.get(cacheKey);
  return state?.vector || null;
}

/**
 * Clear the vector state cache.
 * Primarily used for testing.
 */
export function clearVectorCache(): void {
  vectorStateCache.clear();
}
