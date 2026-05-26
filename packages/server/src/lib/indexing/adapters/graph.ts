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

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';
import { extractBoundaryGraphEntities } from '@trapmap/server/lib/indexing/boundary-extract.js';
import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import { assertNoHardDependencyCycles } from '@trapmap/server/lib/indexing/graph-lite/graphology.js';
import { LlmExtractionCache } from '@trapmap/server/lib/indexing/graph-lite/llm-cache.js';
import { extractGraphEntitiesWithLLM } from '@trapmap/server/lib/indexing/graph-lite/llm-extract.js';
import {
  removeGraphIndexDocumentsForSource,
  upsertGraphIndexDocument,
} from '@trapmap/server/lib/indexing/graph-lite/store.js';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import type { IndexAdapter, IndexSyncResult } from '@trapmap/server/lib/indexing/types.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { buildTrapGraphDocument } from './graph-builders.js';

// ---------------------------------------------------------------------------
// Backward-compatible in-memory index (used by graph-assisted recall during
// transition to fully store-backed reads). Will be removed once the
// orchestrator passes a data snapshot to graphAssistedRecall.
// ---------------------------------------------------------------------------

/** Backward-compatible in-memory graph sync state */
interface LegacyGraphSyncState {
  entryId: string;
  revision: number;
  contentHash: string;
  syncedAt: string;
}

const graphStateCache = new RetrievalCache<LegacyGraphSyncState>({
  maxSize: 500,
  ttlMs: 60 * 60_000, // 1h
  namespace: 'graph-state',
});

const cachedGraphDocuments = new RetrievalCache<GraphIndexDocumentRecord>({
  maxSize: 500,
  ttlMs: 60 * 60_000, // 1h
  namespace: 'graph-docs',
});

const llmCache = new LlmExtractionCache();

function cacheDocument(document: GraphIndexDocumentRecord): void {
  cachedGraphDocuments.set(`${document.sourceType}:${document.sourceId}`, document);
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Graph index adapter implementation with store-backed persistence.
 *
 * sync(document, store?) accepts an optional shared store for durable persistence.
 * When a store is provided, the adapter writes GraphIndexDocumentRecord entries
 * to StoreData.graphIndexDocuments through the store-backed helpers.
 * Before persisting a trap document, the adapter validates that no hard-edge
 * cycle would be introduced by appending the candidate to the existing graph state.
 *
 * For backward compatibility, the adapter also updates the module-level in-memory
 * index so existing graph-assisted recall callers continue to work during migration.
 */
export const graphIndexAdapter: IndexAdapter & {
  sync(
    document: NormalizedIndexDocument,
    store?: SkillShareerStore,
    chat?: ChatProvider,
  ): Promise<IndexSyncResult>;
  remove(ref: { entryId: string; revision: number }, store?: SkillShareerStore): Promise<void>;
} = {
  kind: 'graph',

  async sync(
    document: NormalizedIndexDocument,
    store?: SkillShareerStore,
    chat?: ChatProvider,
  ): Promise<IndexSyncResult> {
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
      // Use LLM extraction when ChatProvider is available, fall back to rule engine
      const llmResult = await extractGraphEntitiesWithLLM(
        chat ?? { provider: 'none', isConfigured: false, invoke: async () => '' },
        document.canonicalText,
        { llmEnabled: !!chat?.isConfigured, cache: llmCache },
        document,
      );
      const extractionResult = { nodes: llmResult.nodes, edges: llmResult.edges };

      // Extract boundary entities and relations
      const trapNodeId = `trap:${document.entryId}`;
      const boundaryResult = extractBoundaryGraphEntities(trapNodeId, document.boundary);

      // Merge nodes and edges from trap and boundary extraction
      const allNodes = [...extractionResult.nodes, ...boundaryResult.nodes];
      const allEdges = [...extractionResult.edges, ...boundaryResult.edges];

      // Build a candidate graph document without persisting
      const candidateDoc = buildTrapGraphDocument({
        normalizedDocument: document,
        nodes: allNodes,
        edges: allEdges,
      });

      // Store-backed persistence path
      if (store) {
        await store.transact((data) => {
          // Validate hard-edge cycle: load existing docs excluding current source/revision,
          // append the candidate, and check for cycles
          const existingDocs = data.graphIndexDocuments.filter(
            (d) =>
              !(
                d.sourceType === 'trap' &&
                d.sourceId === document.entryId &&
                d.revision === document.revision
              ),
          );
          existingDocs.push(candidateDoc);
          assertNoHardDependencyCycles(existingDocs);

          // Persist the graph document
          upsertGraphIndexDocument(data, candidateDoc);
        });
      }

      // Update in-memory cache for transitional graph-assisted recall
      graphStateCache.set(cacheKey, {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        syncedAt: nowIso(),
      });
      cacheDocument(candidateDoc);

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
    store?: SkillShareerStore,
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
      graphStateCache.delete(cacheKey);
    }

    cachedGraphDocuments.delete(`trap:${ref.entryId}`);
  },
};

// ---------------------------------------------------------------------------
// Backward-compatible exports (used by existing graph-assisted recall tests)
// ---------------------------------------------------------------------------

export function getCachedGraphIndexDocuments(): GraphIndexDocumentRecord[] {
  return Array.from(cachedGraphDocuments.values());
}

export function setCachedGraphIndexDocuments(documents: GraphIndexDocumentRecord[]): void {
  cachedGraphDocuments.clear();
  for (const document of documents) {
    cacheDocument(document);
  }
}

/** @deprecated Use store-backed helpers instead */
export function clearGraphCache(): void {
  graphStateCache.clear();
  cachedGraphDocuments.clear();
}
