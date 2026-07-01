/**
 * Legacy derivation path from revision records.
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 * T-12-12: Keep derivation deterministic and revision-scoped with cached outputs
 */

import type {
  SkillArtifactDerivedRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { buildClientManifest } from './client-manifest.js';
import { getDerivationEligibleFiles } from './extract-files.js';
import { buildContentHash } from './hash.js';
import type { DerivedArtifactOutputs } from './types.js';

/**
 * Derive deterministic outputs from a skill artifact revision.
 *
 * This is the main entry point for derivation. It produces:
 * - A distilled profile from SKILL.md and references/
 * - One or more knowledge capsules
 * - A client activation manifest for references, assets, and scripts
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to derive from
 * @returns Derived artifact outputs
 */
export function deriveSkillArtifactOutputs(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
): DerivedArtifactOutputs {
  const derivedAt = nowIso();

  const sourceHash = buildContentHash(
    getDerivationEligibleFiles(revision).map((file) => file.sha256),
  );
  const profile = null;
  const capsules: DerivedArtifactOutputs['capsules'] = [];
  const clientManifest = buildClientManifest(artifact, revision, sourceHash);

  return {
    profile,
    capsules,
    clientManifest,
    sourceHash,
    derivedAt,
  };
}

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
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to update
 * @param derived - Derived outputs to apply
 * @returns Updated artifact record
 */
export function applyDerivedArtifactOutputs(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  derived: DerivedArtifactOutputs,
): SkillArtifactRecord {
  // Create derived record
  const derivedRecord: SkillArtifactDerivedRecord = {
    profile: derived.profile,
    capsules: derived.capsules,
    clientManifest: derived.clientManifest,
    sourceHash: derived.sourceHash,
    derivedAt: derived.derivedAt,
  };

  // Update the revision with derived outputs
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
