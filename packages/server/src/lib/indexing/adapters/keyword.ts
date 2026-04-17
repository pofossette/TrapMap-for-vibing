/**
 * Keyword index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Keyword sync with idempotency based on revision and content hash
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
import { nowIso } from '../../store.js';
import type { NormalizedIndexDocument } from '../types.js';
import type { IndexAdapter, IndexSyncResult } from '../types.js';

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
 * Index state for keyword adapter including persisted state.
 * Extends the base index state with an optional persistedState field.
 */
export interface IndexStateKeyword {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  persistedState?: PersistedKeywordState;
}

/**
 * Create a keyword index adapter that returns the persisted keyword state.
 */
function createKeywordAdapter(): IndexAdapter & {
  upsert(entry: KnowledgeRecord, document: NormalizedIndexDocument): Promise<IndexSyncResult>;
  remove(entry: KnowledgeRecord, ref: { entryId: string; revision: number }): Promise<void>;
} {
  return {
    kind: 'keyword',

    async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
      try {
        // Build persisted keyword state from normalized document
        const keywordState: PersistedKeywordState = {
          tokens: document.tokens,
          fieldTokens: {
            shortcut: document.tokens.filter((t) => document.shortcut.toLowerCase().includes(t)),
            detail: document.tokens.filter((t) => document.detail.toLowerCase().includes(t)),
            labels: document.tokens.filter((t) =>
              document.labels.some((l) => l.toLowerCase().includes(t)),
            ),
          },
        };

        return {
          adapterKind: 'keyword',
          success: true,
          error: null,
          performedWork: true,
          payload: keywordState, // Return the keyword state for the pipeline to persist
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

    async remove(entry: KnowledgeRecord, ref: { entryId: string; revision: number }): Promise<void> {
      // Clear the keyword index state
      if (entry.indexState?.keyword) {
        entry.indexState.keyword = {
          status: 'pending',
          revision: ref.revision,
          contentHash: '',
          lastSyncedAt: null,
          lastError: null,
        };
        // Clear persisted state (typed as IndexStateKeyword)
        (entry.indexState.keyword as IndexStateKeyword).persistedState = undefined;
      }
    },

    /**
     * Legacy upsert method for backward compatibility.
     * This method mutates the entry directly and is used by non-pipeline code.
     */
    async upsert(
      entry: KnowledgeRecord,
      document: NormalizedIndexDocument,
    ): Promise<IndexSyncResult> {
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
            labels: document.tokens.filter((t) =>
              document.labels.some((l) => l.toLowerCase().includes(t)),
            ),
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
            graph: {
              status: 'pending',
              revision: 0,
              contentHash: '',
              lastSyncedAt: null,
              lastError: null,
            },
          };
        }

        // Update keyword sync state
        if (entry.indexState) {
          entry.indexState.keyword = {
            status: 'synced',
            revision: document.revision,
            contentHash: document.contentHash,
            lastSyncedAt: nowIso(),
            lastError: null,
          };

          // Store persisted keyword state (typed as IndexStateKeyword)
          (entry.indexState.keyword as IndexStateKeyword).persistedState = keywordState;
        }

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
     * Legacy remove method for backward compatibility.
     */
    async removeLegacy(
      entry: KnowledgeRecord,
      ref: { entryId: string; revision: number },
    ): Promise<void> {
      if (entry.indexState?.keyword) {
        entry.indexState.keyword = {
          status: 'pending',
          revision: ref.revision,
          contentHash: '',
          lastSyncedAt: null,
          lastError: null,
        };
        // Clear persisted state (typed as IndexStateKeyword)
        (entry.indexState.keyword as IndexStateKeyword).persistedState = undefined;
      }
    },
  };
}

/**
 * Keyword index adapter implementation.
 */
export const keywordIndexAdapter: IndexAdapter = createKeywordAdapter();

/**
 * Legacy upsert method for backward compatibility.
 * This method mutates the entry directly and is used by non-pipeline code.
 */
export async function upsertKeywordIndex(
  entry: KnowledgeRecord,
  document: NormalizedIndexDocument,
): Promise<IndexSyncResult> {
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
        labels: document.tokens.filter((t) =>
          document.labels.some((l) => l.toLowerCase().includes(t)),
        ),
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
        graph: {
          status: 'pending',
          revision: 0,
          contentHash: '',
          lastSyncedAt: null,
          lastError: null,
        },
      };
    }

    // Update keyword sync state
    if (entry.indexState) {
      entry.indexState.keyword = {
        status: 'synced',
        revision: document.revision,
        contentHash: document.contentHash,
        lastSyncedAt: nowIso(),
        lastError: null,
      };

      // Store persisted keyword state (typed as IndexStateKeyword)
      (entry.indexState.keyword as IndexStateKeyword).persistedState = keywordState;
    }

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
}

/**
 * Legacy remove method for backward compatibility.
 */
export async function removeKeywordIndex(
  entry: KnowledgeRecord,
  ref: { entryId: string; revision: number },
): Promise<void> {
  return keywordIndexAdapter.removeLegacy(entry, ref);
}

/**
 * Get persisted keyword tokens for an entry.
 * Returns null if the entry has not been synced.
 *
 * @param entry - The knowledge entry
 * @returns Persisted keyword state or null
 */
export function getIndexedKeywordTokens(entry: KnowledgeRecord): PersistedKeywordState | null {
  if (entry.indexState?.keyword?.status === 'synced') {
    return (entry.indexState.keyword as IndexStateKeyword).persistedState || null;
  }
  return null;
}

/**
 * Check if an entry has indexed keyword tokens.
 *
 * @param entry - The knowledge entry
 * @returns true if the entry has synced keyword tokens
 */
export function hasIndexedKeywordTokens(entry: KnowledgeRecord): boolean {
  return entry.indexState?.keyword?.status === 'synced';
}

/**
 * Keyword index payload type.
 */
export type KeywordIndexPayload = PersistedKeywordState;
