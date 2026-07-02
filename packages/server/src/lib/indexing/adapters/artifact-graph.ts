/**
 * Artifact graph adapter for skill-side graph indexing.
 *
 * This adapter mirrors the trap adapter shape and provides:
 * - sync: Build and persist skill graph documents from derived profile/capsule text
 * - remove: Remove skill graph documents from the store
 *
 * The adapter reads only latestRevision.derived.profile and
 * latestRevision.derived.capsules, never raw asset or script bodies (D-01, D-02).
 *
 * It uses assertNoHardDependencyCycles from the graphology layer
 * to reject hard dependency cycles before persistence.
 *
 * T-36-09: Graph text built only from derived profile/capsule text
 * T-36-10: Governance metadata inherited from artifact root
 */

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import {
  assertNoHardDependencyCycles,
  getGraphIndexDocuments,
  removeGraphIndexDocumentsForSource,
  upsertGraphIndexDocument,
} from '@trapmap/server/lib/indexing/graph-lite/index.js';
import { buildSkillGraphDocument } from '@trapmap/server/lib/indexing/skill-graph-build.js';
import type { SkillArtifactRecord, StoreData } from '@trapmap/server/lib/store.js';

// ---------------------------------------------------------------------------
// Adapter input type
// ---------------------------------------------------------------------------

/**
 * Input for the artifact graph adapter sync operation.
 */
export interface ArtifactGraphAdapterInput {
  /** Store data (within transaction) */
  data: Pick<StoreData, 'graphIndexDocuments'>;
  /** The skill artifact to index */
  artifact: SkillArtifactRecord;
  /** Optional ChatProvider for LLM-powered extraction */
  chat?: ChatProvider;
  /** Optional query backend for PG truth + optional graph projection sync */
  graphQueryBackend?: GraphQueryBackend;
}

/**
 * Input for the artifact graph adapter remove operation.
 */
export interface ArtifactGraphAdapterRemoveInput {
  /** Store data (within transaction) */
  data: Pick<StoreData, 'graphIndexDocuments'>;
  /** The artifact ID to remove */
  artifactId: string;
  /** Optional query backend for PG truth + optional graph projection sync */
  graphQueryBackend?: GraphQueryBackend;
}

/**
 * Result of an artifact graph adapter sync operation.
 */
export interface ArtifactGraphAdapterSyncResult {
  /** Whether sync succeeded */
  success: boolean;
  /** Whether work was performed (false if skipped) */
  performedWork: boolean;
  /** Error message if failed */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Artifact graph adapter interface for skill indexing.
 * Mirrors the trap adapter shape but operates on skill artifacts.
 */
export interface ArtifactGraphAdapter {
  /** Sync (upsert) graph documents for an approved artifact */
  sync(input: ArtifactGraphAdapterInput): Promise<ArtifactGraphAdapterSyncResult>;
  /** Remove graph documents for an artifact */
  remove(input: ArtifactGraphAdapterRemoveInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Default artifact graph adapter implementation.
 *
 * This adapter:
 * - Builds skill graph documents from derived profile/capsule text only
 * - Checks for hard dependency cycles before persistence
 * - Persists with sourceType: 'skill' and sourceId: artifact.id
 * - Removes graph documents on deactivation
 */
export const artifactGraphIndexAdapter: ArtifactGraphAdapter = {
  /**
   * Sync graph index for an approved skill artifact.
   *
   * Reads only derived.profile and derived.capsules, excludes
   * clientManifest.assets and clientManifest.scripts bodies.
   */
  async sync(input: ArtifactGraphAdapterInput): Promise<ArtifactGraphAdapterSyncResult> {
    const { data, artifact, chat, graphQueryBackend } = input;

    try {
      // Build the graph document from derived text only
      const doc = await buildSkillGraphDocument(artifact, chat);

      if (!doc) {
        // No derived content, skip indexing
        return {
          success: true,
          performedWork: false,
          error: null,
        };
      }

      // Check for hard dependency cycles before persistence
      // Include existing documents excluding this artifact's current document
      const existingDocs = getGraphIndexDocuments(data).filter(
        (d) => !(d.sourceType === 'skill' && d.sourceId === artifact.id),
      );
      const allDocs = [...existingDocs, doc];

      assertNoHardDependencyCycles(allDocs);

      // Persist the document
      upsertGraphIndexDocument(data, doc);

      if (graphQueryBackend?.isEnabled()) {
        await graphQueryBackend.upsertDocument(doc);
      }

      return {
        success: true,
        performedWork: true,
        error: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        performedWork: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Remove graph documents for an artifact.
   *
   * Used when an artifact is deactivated or no longer approved.
   * Removes all documents with sourceType='skill' and sourceId=artifactId.
   */
  async remove(input: ArtifactGraphAdapterRemoveInput): Promise<void> {
    const { data, artifactId, graphQueryBackend } = input;
    removeGraphIndexDocumentsForSource(data, 'skill', artifactId);
    if (graphQueryBackend?.isEnabled()) {
      await graphQueryBackend.removeSource('skill', artifactId);
    }
  },
};
