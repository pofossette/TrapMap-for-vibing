/**
 * Keyword index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Keyword upsert with idempotency based on revision and content hash
 * - Idempotent keyword removal
 * - Persisted token state for query-time reuse
 *
 * The adapter persists normalized token arrays and per-field token sets
 * to entry.indexState.keyword, which can be reused during keyword recall
 * to avoid recomputing tokens on every query.
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import type { KnowledgeRecord } from '../../store.js';
import type { NormalizedIndexDocument } from '../types.js';
import type { IndexSyncResult } from '../types.js';
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
 * Keyword index adapter implementation.
 */
export const keywordIndexAdapter = {
  kind: 'keyword' as const,

  /**
   * Upsert keyword index for a knowledge entry.
   *
   * This function:
   * - Persists normalized token arrays and per-field token sets
   * - Stores state to entry.indexState.keyword
   * - Skips work if revision and content hash match (idempotency)
   *
   * @param entry - The knowledge entry to update (mutated in place)
   * @param document - The normalized index document
   * @returns Sync result indicating success and whether work was performed
   */
  async upsert(entry: KnowledgeRecord, document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    // Check if we can skip work (idempotency)
    const currentKeywordState = entry.indexState?.keyword;
    if (
      currentKeywordState &&
      currentKeywordState.status === 'synced' &&
      currentKeywordState.revision === document.revision &&
      currentKeywordState.contentHash === document.contentHash
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

      // Ensure indexState exists
      if (!entry.indexState) {
        entry.indexState = {
          contentHash: document.contentHash,
          normalizedAt: document.normalizedAt,
          vector: {
            status: 'pending',
            revision: 0,
            contentHash: '',
            lastSyncedAt: null,
            lastError: null,
          },
          keyword: {
            status: 'pending',
            revision: 0,
            contentHash: '',
            lastSyncedAt: null,
            lastError: null,
          },
        };
      }

      // Update keyword sync state
      entry.indexState.keyword = {
        status: 'synced',
        revision: document.revision,
        contentHash: document.contentHash,
        lastSyncedAt: nowIso(),
        lastError: null,
      };

      // Store persisted keyword state
      (entry.indexState.keyword as any).persistedState = keywordState;

      return {
        adapterKind: 'keyword',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update state to failed
      if (entry.indexState?.keyword) {
        entry.indexState.keyword.status = 'failed';
        entry.indexState.keyword.lastError = errorMessage;
      }

      return {
        adapterKind: 'keyword',
        success: false,
        error: errorMessage,
        performedWork: false,
      };
    }
  },

  /**
   * Remove keyword index for a knowledge entry.
   *
   * This function:
   * - Clears keyword sync state from entry.indexState.keyword
   * - Is idempotent (safe to call multiple times)
   *
   * @param entry - The knowledge entry to update (mutated in place)
   * @param ref - Entry reference containing entryId and revision
   */
  async remove(entry: KnowledgeRecord, ref: { entryId: string; revision: number }): Promise<void> {
    if (entry.indexState?.keyword) {
      entry.indexState.keyword = {
        status: 'pending',
        revision: ref.revision,
        contentHash: '',
        lastSyncedAt: null,
        lastError: null,
      };
      // Clear persisted state
      delete (entry.indexState.keyword as any).persistedState;
    }
  },
};

/**
 * Get persisted keyword tokens for an entry.
 * Returns null if the entry has not been synced.
 *
 * @param entry - The knowledge entry
 * @returns Persisted keyword state or null
 */
export function getIndexedKeywordTokens(entry: KnowledgeRecord): PersistedKeywordState | null {
  if (entry.indexState?.keyword?.status === 'synced') {
    return (entry.indexState.keyword as any).persistedState || null;
  }
  return null;
}
