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

import type { SkillArtifactRecord, StoreData } from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

/**
 * Registered artifact adapters for fan-out.
 */
let registeredArtifactAdapters: ArtifactGraphAdapter[] = [];

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
  data: StoreData;
  artifact: SkillArtifactRecord;
  adapters?: ArtifactGraphAdapter[];
}): Promise<ArtifactAdapterFanOutResult> {
  const { data, artifact } = args;
  const adapters = args.adapters ?? registeredArtifactAdapters;

  const results: ArtifactAdapterFanOutResult['results'] = [];

  for (const adapter of adapters) {
    try {
      const result = await adapter.sync({ data, artifact });
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
  data: StoreData;
  artifactId: string;
  adapters?: ArtifactGraphAdapter[];
}): Promise<void> {
  const { data, artifactId } = args;
  const adapters = args.adapters ?? registeredArtifactAdapters;

  for (const adapter of adapters) {
    await adapter.remove({ data, artifactId });
  }
}
