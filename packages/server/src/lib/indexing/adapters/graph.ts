/**
 * Graph index adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Graph sync with idempotency based on revision and content hash
 * - Idempotent graph removal
 * - Persisted graph entity and relation data
 *
 * The adapter persists extracted-entity payloads and adjacency-ready relation data
 * keyed by entryId, revision, and contentHash. This is a lightweight, deterministic
 * implementation suitable for Phase 9's graph-assisted retrieval.
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 * Graph payloads remain server-internal and are not exposed through contracts.
 */

import type { NormalizedIndexDocument } from '../types.js';
import type { IndexSyncResult, IndexAdapter } from '../types.js';
import { nowIso } from '../../store.js';
import { extractGraphEntities } from '../../retrieval/graph-extract.js';
import type {
  GraphEntity,
  GraphRelation,
  GraphEntityType,
  GraphRelationType,
} from '../../retrieval/graph-extract.js';

// Re-export types from graph-extract for API compatibility
export type { GraphEntity, GraphRelation };
export type { GraphEntityType, GraphRelationType };

/**
 * Persisted graph state for query-time reuse.
 * Contains extracted entities and relations for an entry.
 */
export interface PersistedGraphState {
  /** Entry reference */
  entryId: string;
  revision: number;
  /** Extracted entities */
  entities: GraphEntity[];
  /** Extracted relations */
  relations: GraphRelation[];
  /** Content hash for change detection */
  contentHash: string;
}

/**
 * In-memory tracking of synced graph state.
 * In production, this would be persisted to the store.
 */
interface GraphSyncState {
  entryId: string;
  revision: number;
  contentHash: string;
  graphState: PersistedGraphState;
  syncedAt: string;
}

// In-memory storage for sync state (worktree-compatible approach)
const graphStateCache = new Map<string, GraphSyncState>();

/**
 * Global graph index for cross-entry traversal.
 * Maps normalized entity values to supporting entries.
 */
const globalGraphIndex = {
  entities: new Map<string, Set<string>>(), // entity value -> entry IDs
  relations: new Map<string, GraphRelation[]>(), // entry ID -> relations
};

/**
 * Generate cache key for graph state.
 */
function getCacheKey(entryId: string, revision: number): string {
  return `${entryId}:${revision}`;
}

/**
 * Build persisted graph artifact from extraction result.
 *
 * This function transforms the extraction result into the persisted shape
 * that the adapter stores for query-time reuse.
 */
export function buildGraphArtifact(
  entryId: string,
  revision: number,
  contentHash: string,
  extractionResult: { entities: GraphEntity[]; relations: GraphRelation[] },
): PersistedGraphState {
  return {
    entryId,
    revision,
    entities: extractionResult.entities,
    relations: extractionResult.relations,
    contentHash,
  };
}

/**
 * Graph index adapter implementation.
 */
export const graphIndexAdapter: IndexAdapter = {
  kind: 'graph',

  /**
   * Sync graph index for a normalized document.
   *
   * This function:
   * - Extracts entities and relations from the normalized document using shared extraction
   * - Persists graph payload keyed by entryId, revision, and contentHash
   * - Updates global graph index for cross-entry traversal
   * - Skips work if revision and content hash match (idempotency)
   *
   * @param document - The normalized index document
   * @returns Sync result indicating success and whether work was performed
   */
  async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
    const cacheKey = getCacheKey(document.entryId, document.revision);
    const existingState = graphStateCache.get(cacheKey);

    // Check if we can skip work (idempotency)
    if (
      existingState &&
      existingState.contentHash === document.contentHash &&
      existingState.revision === document.revision
    ) {
      return {
        adapterKind: 'graph',
        success: true,
        error: null,
        performedWork: false,
      };
    }

    try {
      // Extract entities and relations using shared extraction module
      const extractionResult = extractGraphEntities(document);

      // Build persisted graph state
      const graphState = buildGraphArtifact(
        document.entryId,
        document.revision,
        document.contentHash,
        extractionResult,
      );

      // Persist graph state
      const state: GraphSyncState = {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        graphState,
        syncedAt: nowIso(),
      };

      graphStateCache.set(cacheKey, state);

      // Update global graph index
      for (const entity of extractionResult.entities) {
        if (!globalGraphIndex.entities.has(entity.normalizedValue)) {
          globalGraphIndex.entities.set(entity.normalizedValue, new Set());
        }
        globalGraphIndex.entities.get(entity.normalizedValue)!.add(document.entryId);
      }

      if (!globalGraphIndex.relations.has(document.entryId)) {
        globalGraphIndex.relations.set(document.entryId, []);
      }
      globalGraphIndex.relations.set(document.entryId, extractionResult.relations);

      return {
        adapterKind: 'graph',
        success: true,
        error: null,
        performedWork: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        adapterKind: 'graph',
        success: false,
        error: errorMessage,
        performedWork: false,
      };
    }
  },

  /**
   * Remove graph index for an entry.
   *
   * This function:
   * - Clears graph sync state for the given entry
   * - Removes entry from global graph index
   * - Is idempotent (safe to call multiple times)
   *
   * @param ref - Entry reference containing entryId and revision
   */
  async remove(ref: { entryId: string; revision: number }): Promise<void> {
    const cacheKey = getCacheKey(ref.entryId, ref.revision);
    const existingState = graphStateCache.get(cacheKey);

    if (existingState) {
      // Remove from global graph index
      for (const entity of existingState.graphState.entities) {
        const entrySet = globalGraphIndex.entities.get(entity.normalizedValue);
        if (entrySet) {
          entrySet.delete(ref.entryId);
          if (entrySet.size === 0) {
            globalGraphIndex.entities.delete(entity.normalizedValue);
          }
        }
      }

      globalGraphIndex.relations.delete(ref.entryId);

      // Clear cache
      graphStateCache.delete(cacheKey);
    }
  },
};

/**
 * Get persisted graph state for an entry.
 * Returns null if the entry has not been synced.
 *
 * @param entryId - The knowledge entry ID
 * @param revision - The entry revision
 * @returns Persisted graph state or null
 */
export function getIndexedGraphState(entryId: string, revision: number): PersistedGraphState | null {
  const cacheKey = getCacheKey(entryId, revision);
  const state = graphStateCache.get(cacheKey);
  return state?.graphState || null;
}

/**
 * Get global graph index for cross-entry traversal.
 *
 * @returns Global graph index with entities and relations
 */
export function getGlobalGraphIndex() {
  return {
    entities: globalGraphIndex.entities,
    relations: globalGraphIndex.relations,
  };
}

/**
 * Clear the graph state cache.
 * Primarily used for testing.
 */
export function clearGraphCache(): void {
  graphStateCache.clear();
  globalGraphIndex.entities.clear();
  globalGraphIndex.relations.clear();
}
