/**
 * Apply derived outputs (profile, capsules, client manifest) to artifact revisions.
 *
 * T-12-11: Persist derived outputs on governed revisions
 * T-12-12: Cache outputs for downstream consumption
 */

import type {
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  StoreData,
  StoredScriptActivationPolicy,
} from '@trapmap/server/lib/store.js';
import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/repository.js';

/**
 * Apply derived outputs to a revision record.
 *
 * This persists the derived outputs on the revision for caching.
 * The outputs are keyed by sourceHash so downstream phases can
 * consume them without recomputing derivation.
 *
 * T-12-11: Persist derived outputs on governed revisions
 * T-12-12: Cache outputs for downstream consumption
 *
 * @param data - Store data
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to update
 * @param derived - Derived outputs to apply
 * @param artifactRepo - Optional repository for row-level persistence
 * @returns Updated artifact record
 */
export async function applyDerivedArtifactOutputs(
  _data: StoreData,
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  derived: {
    profile: {
      artifactId: string;
      revision: number;
      sourceHash: string;
      title: string;
      summary: string;
      keywords: string[];
      referencePaths: string[];
      contentHash: string;
    } | null;
    capsules: Array<{
      capsuleId: string;
      artifactId: string;
      revision: number;
      sourcePaths: string[];
      content: string;
      situation: string | null;
      problem: string | null;
      goal: string | null;
      errorText: string | null;
      labels: string[];
      scope: 'global' | 'project';
      requiredLevel: number;
    }>;
    clientManifest: {
      artifactId: string;
      revision: number;
      references: Array<{
        path: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
      }>;
      assets: Array<{
        path: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
      }>;
      scripts: Array<{
        path: string;
        sha256: string;
        capability: string;
        argsSchemaSummary: string;
        sideEffectSummary: string;
        defaultPolicy: StoredScriptActivationPolicy;
      }>;
      sourceHash: string;
    } | null;
    sourceHash: string;
    derivedAt: string;
  },
  artifactRepo?: ArtifactRepository,
): Promise<SkillArtifactRecord> {
  // Create derived record
  const derivedRecord = {
    profile: derived.profile,
    capsules: derived.capsules,
    clientManifest: derived.clientManifest,
    sourceHash: derived.sourceHash,
    derivedAt: derived.derivedAt,
  };

  // Update using repository if available
  if (artifactRepo) {
    await artifactRepo.updateRevisionDerived(artifact.id, revision.revision, derivedRecord);
  }

  // Update the revision with derived outputs (in-memory)
  revision.derived = derivedRecord;

  // Update the artifact's latestRevision reference
  artifact.latestRevision = revision;

  // Update the revision in history
  const historyIndex = artifact.history.findIndex((h) => h.revision === revision.revision);
  if (historyIndex !== -1) {
    artifact.history[historyIndex] = revision;
  }

  return artifact;
}
