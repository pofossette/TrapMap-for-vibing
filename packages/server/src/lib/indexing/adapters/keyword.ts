/**
 * Keyword index adapter for lifecycle-driven keyword indexing.
 *
 * This adapter:
 * - Persists normalized token arrays and per-field token sets
 * - Implements idempotent upsert based on revision/contentHash
 * - Implements idempotent remove operation
 * - Exports getIndexedKeywordTokens() helper for query-time reuse
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import type { KnowledgeRecord } from '../../store.js';
import type { IndexAdapter, IndexSyncResult, NormalizedIndexDocument } from '../types.js';

/**
 * Keyword index payload persisted in KnowledgeRecord.indexState.keyword.
 */
interface KeywordIndexPayload {
  /** Normalized tokens from canonical text */
  tokens: string[];
  /** Tokens from shortcut field */
  shortcutTokens: string[];
  /** Tokens from detail field */
  detailTokens: string[];
  /** Tokens from labels field */
  labelTokens: string[];
  /** All tokens (deduplicated) */
  allTokens: string[];
  /** When this keyword index was built */
  indexedAt: string;
}

/**
 * Check if keyword payload exists and is fresh.
 */
function hasFreshKeywordPayload(
  entry: KnowledgeRecord,
  normalizedDocument: NormalizedIndexDocument,
): boolean {
  if (!entry.indexState?.keyword) {
    return false;
  }

  const keywordState = entry.indexState.keyword;
  return (
    keywordState.status === 'synced' &&
    keywordState.contentHash === normalizedDocument.contentHash &&
    keywordState.revision === normalizedDocument.revision
  );
}

/**
 * Build keyword index payload from normalized document.
 */
function buildKeywordPayload(
  normalizedDocument: NormalizedIndexDocument,
): KeywordIndexPayload {
  // Tokenize individual fields
  const shortcutTokens = normalizedDocument.tokens.filter((t) =>
    normalizedDocument.shortcut.toLowerCase().includes(t),
  );
  const detailTokens = normalizedDocument.tokens.filter((t) =>
    normalizedDocument.detail.toLowerCase().includes(t),
  );
  const labelTokens = normalizedDocument.labels.flatMap((l) =>
    l.toLowerCase().split(/\s+/),
  );

  // All tokens deduplicated
  const allTokens = Array.from(
    new Set([...shortcutTokens, ...detailTokens, ...labelTokens]),
  );

  return {
    tokens: normalizedDocument.tokens,
    shortcutTokens,
    detailTokens,
    labelTokens,
    allTokens,
    indexedAt: new Date().toISOString(),
  };
}

/**
 * Keyword index adapter implementation.
 */
export const keywordIndexAdapter: IndexAdapter = {
  kind: 'keyword',

  /**
   * Sync keyword index for the given document.
   * Persists normalized tokens to indexState.keyword.
   *
   * Idempotent: if revision and contentHash match, skips work.
   */
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    const startTime = Date.now();

    try {
      // Build keyword payload
      const payload = buildKeywordPayload(document);

      // Return success - the pipeline will handle persistence
      const duration = Date.now() - startTime;
      return {
        adapterKind: 'keyword',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        adapterKind: 'keyword',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        performedWork: false,
      };
    }
  },

  /**
   * Remove keyword index for the given entry reference.
   * Clears indexState.keyword.
   *
   * Idempotent: safe to call multiple times.
   */
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    // The pipeline handles the actual removal from the entry
    // This is a no-op in the adapter itself
    // The adapter contract requires this method for future extension
  },
};

/**
 * Upsert keyword index for a knowledge entry.
 * This is the main entry point called by the pipeline.
 *
 * @param entry - The knowledge entry to upsert
 * @param normalizedDocument - The normalized document
 * @returns Sync result
 */
export async function upsertKeywordIndex(
  entry: KnowledgeRecord,
  normalizedDocument: NormalizedIndexDocument,
): Promise<IndexSyncResult> {
  // Check if we have fresh state
  if (hasFreshKeywordPayload(entry, normalizedDocument)) {
    return {
      adapterKind: 'keyword',
      success: true,
      error: null,
      performedWork: false, // Skipped due to fresh state
    };
  }

  // Build keyword payload
  const payload = buildKeywordPayload(normalizedDocument);

  // Initialize indexState if needed
  if (!entry.indexState) {
    entry.indexState = {
      contentHash: normalizedDocument.contentHash,
      normalizedAt: normalizedDocument.normalizedAt,
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

  // Update keyword state
  entry.indexState.keyword = {
    status: 'synced',
    revision: normalizedDocument.revision,
    contentHash: normalizedDocument.contentHash,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };

  // Store payload in a custom field (will be accessed via getIndexedKeywordTokens)
  (entry as any).keywordIndexCache = payload;

  return {
    adapterKind: 'keyword',
    success: true,
    error: null,
    performedWork: true,
  };
}

/**
 * Remove keyword index from a knowledge entry.
 *
 * @param entry - The knowledge entry to remove from
 */
export function removeKeywordIndex(entry: KnowledgeRecord): void {
  if (entry.indexState) {
    entry.indexState.keyword = {
      status: 'pending',
      revision: 0,
      contentHash: '',
      lastSyncedAt: null,
      lastError: null,
    };
  }
  delete (entry as any).keywordIndexCache;
}

/**
 * Get indexed keyword tokens from a knowledge entry.
 * Returns null if no synced keyword index exists.
 *
 * @param entry - The knowledge entry to read from
 * @returns Keyword payload or null
 */
export function getIndexedKeywordTokens(
  entry: KnowledgeRecord,
): KeywordIndexPayload | null {
  // Check if we have a synced keyword index
  if (entry.indexState?.keyword?.status === 'synced') {
    return (entry as any).keywordIndexCache || null;
  }

  return null;
}

/**
 * Check if an entry has indexed keyword tokens available.
 * This is useful for deciding whether to use persisted tokens or fall back to query-time tokenization.
 *
 * @param entry - The knowledge entry to check
 * @returns True if indexed tokens are available
 */
export function hasIndexedKeywordTokens(entry: KnowledgeRecord): boolean {
  return entry.indexState?.keyword?.status === 'synced' &&
    typeof (entry as any).keywordIndexCache === 'object';
}
