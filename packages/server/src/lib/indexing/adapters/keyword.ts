/**
 * Keyword index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Keyword sync with idempotency based on revision and content hash
 * - Idempotent keyword removal
 * - Persisted token state for query-time reuse
 *
 * The adapter persists normalized token arrays and per-field token sets
 * for reuse during keyword recall.
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import type { NormalizedIndexDocument } from '../types.js';
import type { IndexSyncResult, IndexAdapter } from '../types.js';
import { nowIso } from '../../store.js';

/**
 * Persisted keyword state for query-time reuse.
 * Contains normalized tokens and per-field token sets.
 */
export interface PersistedKeywordState {
  /** Normalized tokens (lowercase, deduplicated) */
  tokens: string[];
  /** Per-field token sets for targeted matching */
  fieldTokens: {
    shortcut: string[];
    detail: string[];
    labels: string[];
  };
}

/**
 * In-memory tracking of synced keyword state.
 * In production, this would be persisted to the store.
 */
interface KeywordSyncState {
  entryId: string;
  revision: number;
  contentHash: string;
  keywordState: PersistedKeywordState;
  syncedAt: string;
}

// In-memory storage for sync state (worktree-compatible approach)
const keywordStateCache = new Map<string, KeywordSyncState>();

/**
 * Generate cache key for keyword state.
 */
function getCacheKey(entryId: string, revision: number): string {
  return `${entryId}:${revision}`;
}

/**
 * Keyword index adapter implementation.
 */
export const keywordIndexAdapter: IndexAdapter = {
  kind: 'keyword',

  /**
   * Sync keyword index for a normalized document.
   *
   * This function:
   * - Persists normalized token arrays and per-field token sets
   * - Stores state keyed by entryId, revision, and contentHash
   * - Skips work if revision and content hash match (idempotency)
   *
   * @param document - The normalized index document
   * @returns Sync result indicating success and whether work was performed
   */
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    const cacheKey = getCacheKey(document.entryId, document.revision);
    const existingState = keywordStateCache.get(cacheKey);

    // Check if we can skip work (idempotency)
    if (
      existingState &&
      existingState.contentHash === document.contentHash &&
      existingState.revision === document.revision
    ) {
      return {
        adapterKind: 'keyword',
        success: true,
        error: null,
        performedWork: false,
      };
    }

    try {
      // Build persisted keyword state from normalized document
      const keywordState: PersistedKeywordState = {
        tokens: document.tokens,
        fieldTokens: {
          shortcut: document.tokens.filter((t) => document.shortcut.toLowerCase().includes(t)),
          detail: document.tokens.filter((t) => document.detail.toLowerCase().includes(t)),
          labels: document.tokens.filter((t) => document.labels.some((l) => l.toLowerCase().includes(t))),
        },
      };

      // Persist keyword state
      const state: KeywordSyncState = {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        keywordState,
        syncedAt: nowIso(),
      };

      keywordStateCache.set(cacheKey, state);

      return {
        adapterKind: 'keyword',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        adapterKind: 'keyword',
        success: false,
        error: errorMessage,
        performedWork: false,
      };
    }
  },

  /**
   * Remove keyword index for an entry.
   *
   * This function:
   * - Clears keyword sync state for the given entry
   * - Is idempotent (safe to call multiple times)
   *
   * @param ref - Entry reference containing entryId and revision
   */
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    const cacheKey = getCacheKey(ref.entryId, ref.revision);
    keywordStateCache.delete(cacheKey);
  },
};

/**
 * Get persisted keyword tokens for an entry.
 * Returns null if the entry has not been synced.
 *
 * @param entryId - The knowledge entry ID
 * @param revision - The entry revision
 * @returns Persisted keyword state or null
 */
export function getIndexedKeywordTokens(entryId: string, revision: number): PersistedKeywordState | null {
  const cacheKey = getCacheKey(entryId, revision);
  const state = keywordStateCache.get(cacheKey);
  return state?.keywordState || null;
}

/**
 * Clear the keyword state cache.
 * Primarily used for testing.
 */
export function clearKeywordCache(): void {
  keywordStateCache.clear();
}
