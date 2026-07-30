/**
 * Graph index adapter for lifecycle-driven indexing with owner-backed persistence.
 *
 * This module provides:
 * - Graph sync with idempotency based on revision and content hash
 * - Idempotent graph removal through the knowledge-read graph owner
 * - Hard-edge cycle validation before persist
 * - Persisted graph document data keyed by sourceType and sourceId
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 * Graph payloads remain server-internal and are not exposed through contracts.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type {
  GraphIndexDocumentRecord,
  GraphIndexRepositoryPort,
  GraphQueryBackend,
} from '@trapmap/contracts';
import { RetrievalCache } from '@trapmap/server/lib/cache/index.js';
import { extractBoundaryGraphEntities } from '@trapmap/server/lib/indexing/boundary-extract.js';
import {
  LlmExtractionCache,
  extractGraphEntitiesWithLLM,
  upsertGraphIndexDocument,
} from '@trapmap/server/lib/indexing/graph-lite/index.js';
import { assertNoHardDependencyCycles } from '@trapmap/contracts';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import type { IndexAdapter, IndexSyncResult } from '@trapmap/server/lib/indexing/types.js';
import { createLabelReadProjection } from '@trapmap/server/lib/labels/repository.js';
import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
import { getStorePool, nowIso } from '@trapmap/server/lib/store.js';
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
 * Graph index adapter implementation with owner-backed persistence.
 *
 * sync accepts an injected graph owner for durable persistence.
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
    graphQueryBackend?: GraphQueryBackend,
    storeData?: Pick<StoreData, 'graphIndexDocuments'>,
    graphIndex?: GraphIndexRepositoryPort,
  ): Promise<IndexSyncResult>;
  remove(
    ref: { entryId: string; revision: number },
    _store?: SkillShareerStore,
    graphQueryBackend?: GraphQueryBackend,
    graphIndex?: GraphIndexRepositoryPort,
  ): Promise<void>;
} = {
  kind: 'graph',

  async sync(
    document: NormalizedIndexDocument,
    store?: SkillShareerStore,
    chat?: ChatProvider,
    graphQueryBackend?: GraphQueryBackend,
    storeData?: Pick<StoreData, 'graphIndexDocuments'>,
    graphIndex?: GraphIndexRepositoryPort,
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
      const pool = store ? getStorePool(store) : null;
      // Extract graph entities and relations through the LLM pipeline only.
      const llmResult = await extractGraphEntitiesWithLLM(
        chat ?? { provider: 'none', isConfigured: false, invoke: async () => '' },
        document.canonicalText,
        {
          llmEnabled: !!chat?.isConfigured,
          cache: llmCache,
          alignmentService:
            chat?.isConfigured && pool
              ? {
                  chat,
                  repository: createLabelReadProjection({ pool }),
                  sourceContext: 'trap-extraction',
                }
              : null,
        },
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

      // Owner-backed persistence path
      if (graphIndex) {
        const existingDocs = (await graphIndex.listAll()).filter(
          (entry) =>
            !(
              entry.sourceType === 'trap' &&
              entry.sourceId === document.entryId &&
              entry.revision === document.revision
            ),
        );
        assertNoHardDependencyCycles([...existingDocs, candidateDoc]);
        await graphIndex.upsert(candidateDoc);
      } else if (storeData) {
        const existingDocs = storeData.graphIndexDocuments.filter(
          (d) =>
            !(
              d.sourceType === 'trap' &&
              d.sourceId === document.entryId &&
              d.revision === document.revision
            ),
        );
        existingDocs.push(candidateDoc);
        assertNoHardDependencyCycles(existingDocs);
        upsertGraphIndexDocument(storeData, candidateDoc);
      } else {
        throw new Error('Graph index owner is required for graph indexing');
      }

      // Update in-memory cache for transitional graph-assisted recall
      graphStateCache.set(cacheKey, {
        entryId: document.entryId,
        revision: document.revision,
        contentHash: document.contentHash,
        syncedAt: nowIso(),
      });
      cacheDocument(candidateDoc);

      if (graphQueryBackend?.isEnabled()) {
        await graphQueryBackend.upsertDocument(candidateDoc);
      }

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
    graphQueryBackend?: GraphQueryBackend,
    graphIndex?: GraphIndexRepositoryPort,
  ): Promise<void> {
    // Store-backed removal
    if (graphIndex) {
      await graphIndex.removeBySource('trap', ref.entryId);
    } else {
      throw new Error('Graph index owner is required for graph index removal');
    }

    // Also remove from in-memory cache (backward compat)
    const cacheKey = `${ref.entryId}:${ref.revision}`;
    const existingState = graphStateCache.get(cacheKey);

    if (existingState) {
      graphStateCache.delete(cacheKey);
    }

    cachedGraphDocuments.delete(`trap:${ref.entryId}`);

    if (graphQueryBackend?.isEnabled()) {
      await graphQueryBackend.removeSource('trap', ref.entryId);
    }
  },
};

/** @deprecated Use store-backed helpers instead */
export function clearGraphCache(): void {
  graphStateCache.clear();
  cachedGraphDocuments.clear();
}
