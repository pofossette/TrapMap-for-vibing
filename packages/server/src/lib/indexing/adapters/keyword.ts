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

import {
  type BoundaryFacetIndex,
  buildBoundaryFacetIndex,
} from '@trapmap/server/lib/indexing/boundary-normalize.js';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import type { IndexAdapter, IndexSyncResult } from '@trapmap/server/lib/indexing/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

type EntryRef = { entryId: string; revision: number };

export type KeywordIndexAdapter = IndexAdapter & {
  upsert(entry: KnowledgeRecord, document: NormalizedIndexDocument): Promise<IndexSyncResult>;
  remove(ref: EntryRef): Promise<void>;
  remove(entry: KnowledgeRecord, ref: EntryRef): Promise<void>;
  removeLegacy(entry: KnowledgeRecord, ref: EntryRef): Promise<void>;
};

/**
 * Persisted keyword state for query-time reuse.
 * Contains normalized tokens and per-field token sets.
 */
interface PersistedKeywordState {
  /** Normalized tokens (lowercase, deduplicated) */
  tokens: string[];
  /** Per-field token sets for targeted matching */
  fieldTokens: {
    shortcut: string[];
    detail: string[];
    labels: string[];
  };
  /** Boundary facets for filtering */
  boundaryFacets: BoundaryFacetIndex;
}

/**
 * Index state for keyword adapter including persisted state.
 * Extends the base index state with an optional persistedState field.
 */
interface IndexStateKeyword {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  persistedState?: PersistedKeywordState | undefined;
}

/**
 * Create a keyword index adapter that returns the persisted keyword state.
 */
function createKeywordAdapter(): KeywordIndexAdapter {
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
          boundaryFacets: buildBoundaryFacetIndex(document.boundary),
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

    async remove(entryOrRef: KnowledgeRecord | EntryRef, maybeRef?: EntryRef): Promise<void> {
      if (!maybeRef) {
        return;
      }
      const entry = entryOrRef as KnowledgeRecord;
      const ref = maybeRef;
      // Clear the keyword index state
      if (entry.indexState?.adapters?.keyword) {
        entry.indexState.adapters.keyword = {
          status: 'pending',
          revision: ref.revision,
          contentHash: '',
          lastSyncedAt: null,
          lastError: null,
        };
        // Clear persisted state (typed as IndexStateKeyword)
        (entry.indexState.adapters.keyword as IndexStateKeyword).persistedState = undefined;
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
      const currentKeywordState = entry.indexState?.adapters?.keyword;
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
          boundaryFacets: buildBoundaryFacetIndex(document.boundary),
        };

        // Ensure indexState exists
        if (!entry.indexState) {
          const pendingState = {
            status: 'pending' as const,
            revision: 0,
            contentHash: '',
            lastSyncedAt: null,
            lastError: null,
          };
          entry.indexState = {
            contentHash: document.contentHash,
            normalizedAt: document.normalizedAt,
            adapters: {
              vector: { ...pendingState },
              keyword: { ...pendingState },
              graph: { ...pendingState },
            },
          };
        }

        // Update keyword sync state
        if (entry.indexState) {
          entry.indexState.adapters.keyword = {
            status: 'synced',
            revision: document.revision,
            contentHash: document.contentHash,
            lastSyncedAt: nowIso(),
            lastError: null,
          };

          // Store persisted keyword state (typed as IndexStateKeyword)
          (entry.indexState.adapters.keyword as IndexStateKeyword).persistedState = keywordState;
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
    async removeLegacy(entry: KnowledgeRecord, ref: EntryRef): Promise<void> {
      if (entry.indexState?.adapters?.keyword) {
        entry.indexState.adapters.keyword = {
          status: 'pending',
          revision: ref.revision,
          contentHash: '',
          lastSyncedAt: null,
          lastError: null,
        };
        // Clear persisted state (typed as IndexStateKeyword)
        (entry.indexState.adapters.keyword as IndexStateKeyword).persistedState = undefined;
      }
    },
  };
}

/**
 * Keyword index adapter implementation.
 */
export const keywordIndexAdapter: KeywordIndexAdapter = createKeywordAdapter();

/**
 * Keyword index payload type.
 */
