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

/**
 * Graph entity types supported for extraction.
 */
export type GraphEntityType =
  | 'service'
  | 'tool'
  | 'symptom'
  | 'root-cause'
  | 'fix'
  | 'environment';

/**
 * Graph relation types supported.
 */
export type GraphRelationType =
  | 'mentions'
  | 'causes'
  | 'fixed-by'
  | 'observed-in'
  | 'uses-tool'
  | 'runs-in';

/**
 * Extracted graph entity with type and value.
 */
export interface GraphEntity {
  type: GraphEntityType;
  value: string;
  /** Normalized value for deduplication */
  normalizedValue: string;
}

/**
 * Graph relation between entities.
 */
export interface GraphRelation {
  type: GraphRelationType;
  fromEntity: string; // normalized entity value
  toEntity: string; // normalized entity value
  weight: number; // support count
}

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
 * Normalize entity value for deduplication.
 */
function normalizeEntityValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Deterministic entity extraction from normalized document.
 * Uses bounded heuristics to extract high-value entities.
 */
function extractEntities(document: NormalizedIndexDocument): GraphEntity[] {
  const entities: GraphEntity[] = [];
  const text = document.canonicalText.toLowerCase();
  const tokens = document.tokens;

  // Extract service names (capitalized package-like phrases)
  const servicePattern = /\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*)\b/g;
  const serviceMatches = document.shortcut.match(servicePattern) || [];
  for (const match of serviceMatches) {
    if (match.length > 2) {
      entities.push({
        type: 'service',
        value: match,
        normalizedValue: normalizeEntityValue(match),
      });
    }
  }

  // Extract tool names (from labels and common tool patterns)
  const toolKeywords = ['npm', 'pnpm', 'yarn', 'docker', 'kubernetes', 'git', 'vitest', 'typescript', 'node'];
  for (const tool of toolKeywords) {
    if (text.includes(tool)) {
      entities.push({
        type: 'tool',
        value: tool,
        normalizedValue: normalizeEntityValue(tool),
      });
    }
  }

  // Extract symptoms (error/problem phrases)
  const symptomPatterns = ['error', 'fail', 'timeout', 'crash', 'cannot', 'undefined', 'null', 'leak'];
  for (const symptom of symptomPatterns) {
    if (text.includes(symptom)) {
      entities.push({
        type: 'symptom',
        value: symptom,
        normalizedValue: normalizeEntityValue(symptom),
      });
    }
  }

  // Extract root causes (causal phrases)
  if (text.includes('because') || text.includes('caused by') || text.includes('due to') || text.includes('root cause')) {
    entities.push({
      type: 'root-cause',
      value: 'root-cause',
      normalizedValue: normalizeEntityValue('root-cause'),
    });
  }

  // Extract fixes (remediation phrases)
  const fixPatterns = ['fix', 'use', 'enable', 'set', 'add', 'configure', 'validate'];
  for (const fix of fixPatterns) {
    if (text.includes(fix)) {
      entities.push({
        type: 'fix',
        value: fix,
        normalizedValue: normalizeEntityValue(fix),
      });
    }
  }

  // Extract environment markers
  const envPatterns = ['ci', 'local', 'production', 'staging', 'development'];
  for (const env of envPatterns) {
    if (text.includes(env)) {
      entities.push({
        type: 'environment',
        value: env,
        normalizedValue: normalizeEntityValue(env),
      });
    }
  }

  // Deduplicate by normalized value
  const seen = new Set<string>();
  return entities.filter((e) => {
    if (seen.has(e.normalizedValue)) {
      return false;
    }
    seen.add(e.normalizedValue);
    return true;
  });
}

/**
 * Deterministic relation extraction from entities.
 * Creates simple typed relations based on entity co-occurrence.
 */
function extractRelations(entities: GraphEntity[]): GraphRelation[] {
  const relations: GraphRelation[] = [];

  // Group entities by type
  const byType = new Map<GraphEntityType, GraphEntity[]>();
  for (const entity of entities) {
    if (!byType.has(entity.type)) {
      byType.set(entity.type, []);
    }
    byType.get(entity.type)!.push(entity);
  }

  // Create simple relations based on co-occurrence
  const symptoms = byType.get('symptom') || [];
  const fixes = byType.get('fix') || [];
  const tools = byType.get('tool') || [];

  // Symptom -> Fix relations
  for (const symptom of symptoms) {
    for (const fix of fixes) {
      relations.push({
        type: 'fixed-by',
        fromEntity: symptom.normalizedValue,
        toEntity: fix.normalizedValue,
        weight: 1,
      });
    }
  }

  // Fix -> Tool relations
  for (const fix of fixes) {
    for (const tool of tools) {
      relations.push({
        type: 'uses-tool',
        fromEntity: fix.normalizedValue,
        toEntity: tool.normalizedValue,
        weight: 1,
      });
    }
  }

  return relations;
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
   * - Extracts entities and relations from the normalized document
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
      // Extract entities and relations
      const entities = extractEntities(document);
      const relations = extractRelations(entities);

      // Build persisted graph state
      const graphState: PersistedGraphState = {
        entryId: document.entryId,
        revision: document.revision,
        entities,
        relations,
        contentHash: document.contentHash,
      };

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
      for (const entity of entities) {
        if (!globalGraphIndex.entities.has(entity.normalizedValue)) {
          globalGraphIndex.entities.set(entity.normalizedValue, new Set());
        }
        globalGraphIndex.entities.get(entity.normalizedValue)!.add(document.entryId);
      }

      if (!globalGraphIndex.relations.has(document.entryId)) {
        globalGraphIndex.relations.set(document.entryId, []);
      }
      globalGraphIndex.relations.set(document.entryId, relations);

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
