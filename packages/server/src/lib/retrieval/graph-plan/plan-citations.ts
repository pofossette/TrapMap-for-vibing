/**
 * Citation building for plan compilation.
 * Builds citations for skills that were demoted by the skill budget.
 */

import type { PlanCitation } from '@trapmap/contracts';
import { isArtifactGovernanceEligible } from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleCandidate,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

/**
 * Build citations for skills that were demoted by budget.
 * Only includes governance-approved sources.
 */
export function buildCitations(
  allCandidates: CapsuleCandidate[],
  selectedSkills: { artifactId: string }[],
  artifacts: SkillArtifactRecord[],
  governanceFilters: ArtifactGovernanceFilters,
): PlanCitation[] {
  // Build set of selected artifact IDs
  const selectedArtifactIds = new Set(selectedSkills.map((s) => s.artifactId));

  // Build artifact lookup
  const artifactById = new Map<string, SkillArtifactRecord>();
  for (const artifact of artifacts) {
    artifactById.set(artifact.id, artifact);
  }

  // Build citations for demoted candidates
  const citations: PlanCitation[] = [];

  for (const candidate of allCandidates) {
    // Skip selected skills
    if (selectedArtifactIds.has(candidate.artifactId)) {
      continue;
    }

    const artifact = artifactById.get(candidate.artifactId);
    if (!artifact) continue;

    // Skip if not governance eligible (belt-and-suspenders)
    if (!isArtifactGovernanceEligible(artifact, governanceFilters)) {
      continue;
    }

    const capsule = artifact.latestRevision.derived?.capsules.find(
      (c) => c.capsuleId === candidate.capsuleId,
    );

    citations.push({
      sourceId: artifact.id,
      sourceKind: 'skill',
      label: capsule?.situation?.slice(0, 280) ?? artifact.title ?? 'Unknown skill',
      scope: artifact.scope,
      score: candidate.finalScore,
    });
  }

  // Sort by score descending
  return citations.sort((a, b) => b.score - a.score);
}
