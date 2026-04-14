/**
 * Indexing types and interfaces for lifecycle-driven indexing.
 *
 * This module defines:
 * - NormalizedIndexDocument: canonical searchable document for all adapters
 * - IndexAdapter: adapter contract for vector, keyword, and future channels
 * - IndexSyncResult: result of adapter sync operations
 * - KnowledgeIndexStateRecord: persisted index state on KnowledgeRecord
 */

import type { LifecycleState, Scope } from '@skill-shareer/contracts';

/**
 * Normalized index document produced by the normalization stage.
 * All adapters consume this single canonical representation.
 */
export interface NormalizedIndexDocument {
  /** Entry ID */
  entryId: string;
  /** Team ID (null for global entries) */
  teamId: string | null;
  /** Scope (global or project) */
  scope: Scope;
  /** Required security level */
  requiredLevel: number;
  /** Current lifecycle state */
  lifecycleState: LifecycleState;
  /** Revision number */
  revision: number;
  /** Entry last updated timestamp */
  updatedAt: string;
  /** Shortcut text */
  shortcut: string;
  /** Detail text */
  detail: string;
  /** Labels array */
  labels: string[];
  /** Canonical text for embedding and keyword search */
  canonicalText: string;
  /** Normalized tokens (lowercase, deduplicated) */
  tokens: string[];
  /** SHA-256 hash of canonical content for change detection */
  contentHash: string;
  /** When this document was normalized */
  normalizedAt: string;
}

/**
 * Adapter-specific sync status tracked in the store.
 */
export interface AdapterSyncState {
  /** Current sync status */
  status: 'pending' | 'synced' | 'failed';
  /** Revision that was last synced */
  revision: number;
  /** Content hash that was last synced */
  contentHash: string;
  /** When this adapter was last synced */
  lastSyncedAt: string | null;
  /** Last error message (if sync failed) */
  lastError: string | null;
}

/**
 * Complete index state record persisted on KnowledgeRecord.
 */
export interface KnowledgeIndexStateRecord {
  /** SHA-256 hash of the normalized content */
  contentHash: string;
  /** When the content was last normalized */
  normalizedAt: string;
  /** Vector adapter sync state */
  vector: AdapterSyncState;
  /** Keyword adapter sync state */
  keyword: AdapterSyncState;
}

/**
 * Result of a single adapter sync operation.
 */
export interface IndexSyncResult {
  /** Adapter kind */
  adapterKind: 'vector' | 'keyword';
  /** Whether sync succeeded */
  success: boolean;
  /** Error message if failed */
  error: string | null;
  /** Whether the adapter actually performed work (false if skipped due to no change) */
  performedWork: boolean;
}

/**
 * Result of syncing a single entry across all adapters.
 */
export interface EntrySyncResult {
  /** Entry ID */
  entryId: string;
  /** Whether the entry was approved (only approved entries are synced) */
  wasApproved: boolean;
  /** Individual adapter results */
  adapters: IndexSyncResult[];
  /** Overall success */
  success: boolean;
}

/**
 * Result of a reconciliation pass over all entries.
 */
export interface ReconcileResult {
  /** Total entries processed */
  totalEntries: number;
  /** Entries synced (approved) */
  entriesSynced: number;
  /** Entries removed (non-approved/deactivated) */
  entriesRemoved: number;
  /** Entries skipped (already in correct state) */
  entriesSkipped: number;
  /** Processing duration in milliseconds */
  durationMs: number;
}

/**
 * Index adapter contract.
 * All adapters must implement this interface for fan-out from the pipeline.
 */
export interface IndexAdapter {
  /** Adapter kind for identification */
  kind: 'vector' | 'keyword';
  /**
   * Sync or build index for the given document.
   * Should be idempotent - calling twice with same document should produce same state.
   */
  sync(document: NormalizedIndexDocument): Promise<IndexSyncResult>;
  /**
   * Remove index for the given entry reference.
   * Should be idempotent - calling twice should not error.
   */
  remove(ref: { entryId: string; revision: number }): Promise<void>;
}
