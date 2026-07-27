/**
 * Artifact-side adapter fan-out seam for skill indexing.
 *
 * This module provides the equivalent of the existing knowledge indexing pipeline
 * but for skill artifacts. It:
 * - Loads an approved skill artifact snapshot
 * - Normalizes the artifact-side indexing payload once
 * - Fans out to registered artifact adapters
 *
 * The seam is used by runSkillIndexEvent to delegate indexing to adapters
 * rather than writing directly to graph-lite/store.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type { ArtifactIndexingEntry, GraphIndexRepositoryPort } from '@trapmap/contracts';
import {
  type SkillArtifactRecord,
  type SkillShareerStore,
  type StoreData,
  getStorePool,
} from '@trapmap/server/lib/store.js';
import { artifactGraphIndexAdapter } from './adapters/artifact-graph.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';
import { createCapsuleIndexAdapter } from './adapters/capsule-index.js';

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

/**
 * Registered artifact adapters for fan-out.
 */
let registeredArtifactAdapters: ArtifactGraphAdapter[] = [];
const storeArtifactAdapterCache = new WeakMap<SkillShareerStore, ArtifactGraphAdapter[]>();

/**
 * Register artifact adapters for the fan-out pipeline.
 *
 * @param adapters - Array of artifact graph adapters to register
 */
export function registerArtifactAdapters(adapters: ArtifactGraphAdapter[]): void {
  registeredArtifactAdapters = adapters;
}

/**
 * Get registered artifact adapters.
 *
 * @returns Currently registered artifact adapters
 */
export function getArtifactAdapters(): ArtifactGraphAdapter[] {
  return registeredArtifactAdapters;
}

/**
 * Resolve the shared artifact adapter list for a store instance.
 *
 * Tests and bootstrap code can still override this by registering adapters
 * explicitly. Otherwise we lazily assemble the default lifecycle adapters.
 */
export function resolveArtifactAdapters(store: SkillShareerStore): ArtifactGraphAdapter[] {
  if (registeredArtifactAdapters.length > 0) {
    return registeredArtifactAdapters;
  }

  const cached = storeArtifactAdapterCache.get(store);
  if (cached) {
    return cached;
  }

  const adapters: ArtifactGraphAdapter[] = [artifactGraphIndexAdapter];
  const pool = getStorePool(store);
  if (pool) {
    adapters.push(createCapsuleIndexAdapter({ pool }));
  }

  storeArtifactAdapterCache.set(store, adapters);
  return adapters;
}

// ---------------------------------------------------------------------------
// Fan-out seam
// ---------------------------------------------------------------------------

/**
 * Result of running artifact adapters for a skill.
 */
export interface ArtifactAdapterFanOutResult {
  /** Whether all adapters succeeded */
  success: boolean;
  /** Per-adapter results */
  results: Array<{
    /** Whether this adapter succeeded */
    success: boolean;
    /** Whether this adapter performed work */
    performedWork: boolean;
    /** Error message if adapter failed */
    error: string | null;
  }>;
}

/**
 * Run the artifact adapter fan-out for an approved skill.
 *
 * This is the central seam that:
 * 1. Loads the artifact data (provided by caller)
 * 2. Fans out to all registered artifact adapters
 * 3. Returns aggregate results
 *
 * @param args - Fan-out arguments
 * @returns Aggregate result from all adapters
 */
export async function runArtifactAdapterFanOut(args: {
  data?: StoreData;
  artifact: SkillArtifactRecord | ArtifactIndexingEntry;
  store?: SkillShareerStore;
  chat?: ChatProvider;
  graphQueryBackend?: Parameters<ArtifactGraphAdapter['sync']>[0]['graphQueryBackend'];
  graphIndex?: GraphIndexRepositoryPort;
  adapters?: ArtifactGraphAdapter[];
}): Promise<ArtifactAdapterFanOutResult> {
  const { data, artifact } = args;
  const adapters =
    args.adapters ??
    (args.store ? resolveArtifactAdapters(args.store) : registeredArtifactAdapters);

  const results: ArtifactAdapterFanOutResult['results'] = [];

  for (const adapter of adapters) {
    try {
      const result = await adapter.sync({
        ...(data ? { data } : {}),
        artifact,
        ...(args.chat ? { chat: args.chat } : {}),
        ...(args.graphQueryBackend !== undefined
          ? { graphQueryBackend: args.graphQueryBackend }
          : {}),
        ...(args.graphIndex !== undefined ? { graphIndex: args.graphIndex } : {}),
      });
      results.push({
        success: result.success,
        performedWork: result.performedWork,
        error: result.error,
      });
    } catch (error) {
      results.push({
        success: false,
        performedWork: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}

/**
 * Run the artifact adapter removal for a deactivated skill.
 *
 * @param args - Removal arguments
 */
export async function runArtifactAdapterRemoval(args: {
  data?: StoreData;
  artifactId: string;
  store?: SkillShareerStore;
  graphQueryBackend?: Parameters<ArtifactGraphAdapter['remove']>[0]['graphQueryBackend'];
  graphIndex?: GraphIndexRepositoryPort;
  adapters?: ArtifactGraphAdapter[];
}): Promise<void> {
  const { data, artifactId } = args;
  const adapters =
    args.adapters ??
    (args.store ? resolveArtifactAdapters(args.store) : registeredArtifactAdapters);

  for (const adapter of adapters) {
    await adapter.remove({
      ...(data ? { data } : {}),
      artifactId,
      ...(args.graphQueryBackend !== undefined
        ? { graphQueryBackend: args.graphQueryBackend }
        : {}),
      ...(args.graphIndex !== undefined ? { graphIndex: args.graphIndex } : {}),
    });
  }
}
