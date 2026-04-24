/**
 * Graph index adapter for lifecycle-driven indexing with store-backed persistence.
 *
 * This module provides:
 * - Graph sync with idempotency based on revision and content hash
 * - Idempotent graph removal through store-backed helpers
 * - Hard-edge cycle validation before persist
 * - Persisted graph document data keyed by sourceType and sourceId
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 * Graph payloads remain server-internal and are not exposed through contracts.
 */

import type { JsonStore, StoreData } from '../../store.js';
import { nowIso } from '../../store.js';
import { extractTrapGraphEntities } from '../../retrieval/graph-extract.js';
import { buildTrapGraphDocument } from './graph-builders.js';
import {
  getGraphIndexDocuments,
  upsertGraphIndexDocument,
  removeGraphIndexDocumentsForSource,
} from '../graph-lite/store.js';
import { assertNoHardDependencyCycles } from '../graph-lite/graphology.js';
import type { NormalizedIndexDocument } from '../types.js';
import type { IndexAdapter, IndexSyncResult } from '../types.js';

// ---------------------------------------------------------------------------
// Backward-compatible in-memory index (used by graph-assisted recall during
// transition to fully store-backed reads). Will be removed once the
// orchestrator passes a data snapshot to graphAssistedRecall.
// ---------------------------------------------------------------------------

/** @deprecated Use store-backed getGraphIndexDocuments instead */
interface LegacyGraphSyncState {
  entryId: string;
  revision: number;
  contentHash: string;
  syncedAt: string;
}

const graphStateCache = new Map<string, LegacyGraphSyncState>();

/** @deprecated Use store-backed helpers instead */
const globalGraphIndex = {
  entities: new Map<string, Set<string>>(),
  relations: new Map<string, Array<{ type: string; fromEntity: string; toEntity: string; weight: number }>>(),
};

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Graph index adapter implementation with store-backed persistence.
 *
 * sync(document, store?) accepts an optional JsonStore for durable persistence.
 * When a store is provided, the adapter writes GraphIndexDocumentRecord entries
 * to StoreData.graphIndexDocuments through the store-backed helpers.
 * Before persisting a trap document, the adapter validates that no hard-edge
 * cycle would be introduced by appending the candidate to the existing graph state.
 *
 * For backward compatibility, the adapter also updates the module-level in-memory
 * index so existing graph-assisted recall callers continue to work during migration.
 */
export const graphIndexAdapter: IndexAdapter & {
  sync(document: NormalizedIndexDocument, store?: JsonStore): Promise<IndexSyncResult>;
  remove(ref: { entryId: string; revision: number }, store?: JsonStore): Promise<void>;
} = {
  kind: 'graph',

  async sync(document: NormalizedIndexDocument, store?: JsonStore): Promise<IndexSyncResult> {
    const cacheKey = `${document.entryId}:${document.revision}`;
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
      // Extract TrapMap-specific entities and relations
      const extractionResult = extractTrapGraphEntities(document);

      // Build a candidate graph document without persisting
      const candidateDoc = buildTrapGraphDocument({
        normalizedDocument: document,
        nodes: extractionResult.nodes,
        edges: extractionResult.edges,
      });

      // Store-backed persistence path
      if (store) {
        await store.transact((data) => {
          // Validate hard-edge cycle: load existing docs excluding current source/revision,
          // append the candidate, and check for cycles
          const existingDocs = data.graphIndexDocuments.filter(
            (d) => !(d.sourceType === 'trap' && d.sourceId === document.entryId && d.revision === document.revision),
          );
          existingDocs.push(candidateDoc);
          assertNoHardDependencyCycles(existingDocs);

          // Persist the graph document
          upsertGraphIndexDocument(data, candidateDoc);
        });
      }

      // Update in-memory cache for backward compat with graph-assisted recall
      graphStateCache.set(cacheKey, {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        syncedAt: nowIso(),
      });

      // Update global in-memory index (backward compat)
      for (const node of extractionResult.nodes) {
        const entityKey = node.label.toLowerCase().trim().replace(/\s+/g, '-');
        if (!globalGraphIndex.entities.has(entityKey)) {
          globalGraphIndex.entities.set(entityKey, new Set());
        }
        globalGraphIndex.entities.get(entityKey)?.add(document.entryId);
      }

      globalGraphIndex.relations.set(
        document.entryId,
        extractionResult.edges.map((edge) => ({
          type: edge.relationType,
          fromEntity: edge.sourceNodeId,
          toEntity: edge.targetNodeId,
          weight: edge.strength === 'hard' ? 2 : 1,
        })),
      );

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

  async remove(
    ref: { entryId: string; revision: number },
    store?: JsonStore,
  ): Promise<void> {
    // Store-backed removal
    if (store) {
      await store.transact((data) => {
        removeGraphIndexDocumentsForSource(data, 'trap', ref.entryId);
      });
    }

    // Also remove from in-memory cache (backward compat)
    const cacheKey = `${ref.entryId}:${ref.revision}`;
    const existingState = graphStateCache.get(cacheKey);

    if (existingState) {
      // Remove from global in-memory index
      const entityKeysToRemove: string[] = [];
      for (const [entityKey, entrySet] of globalGraphIndex.entities.entries()) {
        if (entrySet.has(ref.entryId)) {
          entrySet.delete(ref.entryId);
          if (entrySet.size === 0) {
            entityKeysToRemove.push(entityKey);
          }
        }
      }
      for (const key of entityKeysToRemove) {
        globalGraphIndex.entities.delete(key);
      }

      globalGraphIndex.relations.delete(ref.entryId);
      graphStateCache.delete(cacheKey);
    }
  },
};

// ---------------------------------------------------------------------------
// Backward-compatible exports (used by existing graph-assisted recall tests)
// ---------------------------------------------------------------------------

/** @deprecated Use store-backed getGraphIndexDocuments instead */
export function getGlobalGraphIndex() {
  return {
    entities: globalGraphIndex.entities,
    relations: globalGraphIndex.relations,
  };
}

/** @deprecated Use store-backed helpers instead */
export function clearGraphCache(): void {
  graphStateCache.clear();
  globalGraphIndex.entities.clear();
  globalGraphIndex.relations.clear();
}
