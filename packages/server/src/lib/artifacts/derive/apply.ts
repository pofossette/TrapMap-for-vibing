/**
 * Unified derivation-and-application seam.
 *
 * Computes derived artifact outputs (profile, capsules, clientManifest) and
 * persists them on the revision.  All callers — import, migrate, and edit —
 * converge on this single entry point to avoid divergent derivation strategies.
 */

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type {
  ArtifactFilePayloadRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';
import { applyDerivedArtifactOutputs as applyDerivedArtifactOutputsFromModel } from '@trapmap/server/lib/artifacts/model.js';
import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/repository.js';
import { deriveFromPayloads } from './from-payloads.js';
import { deriveSkillArtifactOutputs } from './legacy.js';

/**
 * Unified derivation-and-application seam.
 *
 * **Fallback policy:**
 *
 * | filePayloads provided? | Strategy used                        | Grade          |
 * |------------------------|--------------------------------------|----------------|
 * | Yes (length > 0)       | `deriveFromPayloads()`               | Retrieval-grade|
 * | No / empty             | `deriveSkillArtifactOutputs()`       | Legacy         |
 *
 * The legacy fallback is bounded to import-from-bundle-without-content and
 * legacy migration paths where file content bodies are unavailable.  When
 * `filePayloads` are present, the result is retrieval-grade: profile summaries,
 * capsule content, and keywords are built from actual SKILL.md and reference
 * text rather than title/label placeholders.
 *
 * @param artifact    - The artifact record (mutated in-place by `applyDerivedArtifactOutputs`)
 * @param revision    - The revision to derive from (mutated in-place)
 * @param filePayloads - Optional file payload records with content for retrieval-grade derivation
 * @param chat        - Optional chat provider for contextual capsule enrichment
 * @param artifactRepo - Optional repository for row-level persistence
 * @returns The updated artifact with derived outputs persisted on the revision
 */
export async function deriveAndApplyOutputs(args: {
  artifact: SkillArtifactRecord;
  revision: SkillArtifactRevisionRecord;
  filePayloads?: ArtifactFilePayloadRecord[] | undefined;
  chat?: ChatProvider | undefined;
  artifactRepo?: ArtifactRepository | undefined;
}): Promise<SkillArtifactRecord> {
  const { artifact, revision, filePayloads, chat, artifactRepo } = args;

  const derived =
    filePayloads && filePayloads.length > 0
      ? await deriveFromPayloads(filePayloads, {
          artifactId: artifact.id,
          labels: artifact.labels,
          title: artifact.title,
          scope: artifact.scope,
          requiredLevel: artifact.requiredLevel,
          chat,
        })
      : deriveSkillArtifactOutputs(artifact, revision);

  // Patch revision numbers when using retrieval-grade path.
  // deriveFromPayloads() hardcodes revision: 1; the caller must set the real value.
  if (derived.profile) {
    derived.profile.revision = revision.revision;
  }
  for (const capsule of derived.capsules) {
    capsule.revision = revision.revision;
  }

  // Ensure derived.sourceHash matches the revision's canonical sourceHash.
  // The revision's sourceHash (from computeEditSourceHash / computeSourceHash)
  // may use a different concatenation scheme than buildContentHash used inside
  // deriveSkillArtifactOutputs.  The contract schema refinement
  // (derived.sourceHash === sourceHash) requires them to agree.
  derived.sourceHash = revision.sourceHash;

  // NOTE: _data param in model.ts version is unused (StoreData); pass a minimal placeholder
  return applyDerivedArtifactOutputsFromModel({} as any, artifact, revision, derived, artifactRepo);
}
