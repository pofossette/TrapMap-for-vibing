/**
 * Capsule index adapter for skill artifact lifecycle indexing.
 *
 * Wraps createCapsuleIndexSync() to provide lifecycle-aware capsule index
 * maintenance: sync on approve, stale cleanup on revision changes,
 * full removal on leave-approved.
 *
 * This adapter operates on PostgreSQL capsule index tables
 * (skill_artifact_capsule_keywords, skill_artifact_capsule_embeddings)
 * and is called from route post-commit handlers alongside the graph adapter.
 */

import type { Pool } from 'pg';

import type { ArtifactGraphAdapter } from '@trapmap/server/lib/indexing/adapters/artifact-graph.js';
import { createCapsuleIndexSync } from '@trapmap/server/lib/retrieval/capsules/repositories/index-sync.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapsuleIndexAdapterConfig {
  pool: Pool;
  /** Optional feature flag for gating PG writes */
  featureFlag?: () => boolean;
  /** Logger for operational messages */
  log?: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
  };
}

export interface CapsuleSyncResult {
  synced: number;
  staleRemoved: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Create a capsule index adapter for lifecycle-driven maintenance.
 */
export function createCapsuleIndexAdapter(
  config: CapsuleIndexAdapterConfig,
): ArtifactGraphAdapter & {
  syncArtifact(artifact: SkillArtifactRecord): Promise<CapsuleSyncResult>;
  removeArtifact(artifactId: string): Promise<void>;
} {
  const syncConfig: Parameters<typeof createCapsuleIndexSync>[0] = {
    pool: config.pool,
  };
  if (config.featureFlag) {
    syncConfig.featureFlag = config.featureFlag;
  }
  const sync = createCapsuleIndexSync(syncConfig);

  /**
   * Sync capsules for an approved artifact and clean up stale entries.
   *
   * - Upserts all capsules in the current revision
   * - Removes index rows for capsules no longer in the current revision
   */
  async function syncArtifact(artifact: SkillArtifactRecord): Promise<CapsuleSyncResult> {
    // Get currently indexed capsule IDs for this artifact
    const indexedIds = await sync.getIndexedCapsuleIds(artifact.id);

    // Sync current capsules (upsert)
    const result = await sync.syncArtifactCapsules(artifact);
    const currentIds = new Set(
      (artifact.latestRevision.derived?.capsules ?? []).map((c) => c.capsuleId),
    );

    // Remove stale capsules that are no longer in the current revision
    const staleIds = indexedIds.filter((id) => !currentIds.has(id));
    for (const staleId of staleIds) {
      await sync.removeCapsuleIndex(staleId);
    }

    const errors =
      result.keyword.filter((r) => r.status === 'failed').length +
      result.embedding.filter((r) => r.status === 'failed').length;

    if (staleIds.length > 0) {
      config.log?.info(
        `Capsule index sync: ${result.keyword.length} synced, ${staleIds.length} stale removed, ${errors} errors`,
      );
    }

    return {
      synced: result.keyword.length,
      staleRemoved: staleIds.length,
      errors,
    };
  }

  /**
   * Remove all capsule index rows for an artifact.
   *
   * Used when an artifact leaves the approved lifecycle state.
   */
  async function removeArtifact(artifactId: string): Promise<void> {
    await sync.removeCapsuleIndexesForArtifact(artifactId);
  }

  return {
    async sync(input) {
      const result = await syncArtifact(input.artifact);
      return {
        success: result.errors === 0,
        performedWork: result.synced > 0 || result.staleRemoved > 0,
        error: result.errors > 0 ? `${result.errors} capsule index sync error(s)` : null,
      };
    },
    async remove(input) {
      await removeArtifact(input.artifactId);
    },
    syncArtifact,
    removeArtifact,
  };
}
