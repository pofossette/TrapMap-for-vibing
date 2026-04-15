/**
 * Vector index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Vector upsert with idempotency based on revision and content hash
 * - Idempotent vector removal
 * - EmbeddingCache mirroring for compatibility during migration
 *
 * The adapter persists vector payloads to entry.indexState.vector and
 * mirrors them to entry.embeddingCache for backward compatibility.
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import type { KnowledgeRecord } from '../../store.js';
import type { NormalizedIndexDocument } from '../types.js';
import type { IndexSyncResult } from '../types.js';
import { generateEmbedding } from '../../embeddings.js';
import { nowIso } from '../../store.js';

/**
 * Vector index adapter implementation.
 */
export const vectorIndexAdapter = {
  kind: 'vector' as const,

  /**
   * Upsert vector index for a knowledge entry.
   *
   * This function:
   * - Generates embedding vector for the normalized document
   * - Persists vector payload to entry.indexState.vector
   * - Mirrors to entry.embeddingCache for compatibility
   * - Skips work if revision and content hash match (idempotency)
   *
   * @param entry - The knowledge entry to update (mutated in place)
   * @param document - The normalized index document
   * @returns Sync result indicating success and whether work was performed
   */
  async upsert(entry: KnowledgeRecord, document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    // Check if we can skip work (idempotency)
    const currentVectorState = entry.indexState?.vector;
    if (
      currentVectorState &&
      currentVectorState.status === 'synced' &&
      currentVectorState.revision === document.revision &&
      currentVectorState.contentHash === document.contentHash
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

      // Update vector sync state
      entry.indexState.vector = {
        status: 'synced',
        revision: document.revision,
        contentHash: document.contentHash,
        lastSyncedAt: nowIso(),
        lastError: null,
      };

      // Mirror to embeddingCache for compatibility during migration
      entry.embeddingCache = {
        textHash: document.contentHash, // Use contentHash as textHash
        vector,
        createdAt: nowIso(),
        revision: document.revision,
      };

      return {
        adapterKind: 'vector',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update state to failed
      if (entry.indexState?.vector) {
        entry.indexState.vector.status = 'failed';
        entry.indexState.vector.lastError = errorMessage;
      }

      return {
        adapterKind: 'vector',
        success: false,
        error: errorMessage,
        performedWork: false,
      };
    }
  },

  /**
   * Remove vector index for a knowledge entry.
   *
   * This function:
   * - Clears vector sync state from entry.indexState.vector
   * - Does NOT clear embeddingCache (kept for compatibility)
   * - Is idempotent (safe to call multiple times)
   *
   * @param entry - The knowledge entry to update (mutated in place)
   * @param ref - Entry reference containing entryId and revision
   */
  async remove(entry: KnowledgeRecord, ref: { entryId: string; revision: number }): Promise<void> {
    if (entry.indexState?.vector) {
      entry.indexState.vector = {
        status: 'pending',
        revision: ref.revision,
        contentHash: '',
        lastSyncedAt: null,
        lastError: null,
      };
    }
    // Note: We do NOT clear embeddingCache here for compatibility
    // The cache will be updated when/if the entry is re-approved
  },
};
