/**
 * Skill budget application and prioritization for plan compilation.
 * Prioritizes trap-mitigating skills when applying the skill budget.
 */

import type { PlanSkillNode } from '@trapmap/contracts';
import type { GraphQueryExpansionView } from '@trapmap/service-knowledge-read';
import type { CapsuleCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

/**
 * Apply skill budget, prioritizing trap-mitigating skills.
 * Returns exactly `budget` PlanSkillNode objects.
 */
export function applySkillBudget(
  skillCandidates: CapsuleCandidate[],
  artifacts: SkillArtifactRecord[],
  mitigatingSkillNodeIds: string[],
  budget: number,
  expansionView: GraphQueryExpansionView,
  blockingTrapNodeIds: string[],
): PlanSkillNode[] {
  if (skillCandidates.length === 0) {
    return [];
  }

  // Build artifact lookup
  const artifactById = new Map<string, SkillArtifactRecord>();
  for (const artifact of artifacts) {
    artifactById.set(artifact.id, artifact);
  }

  // Build node ID to artifact mapping
  const nodeIdToArtifactId = new Map<string, string>();
  for (const [nodeId, nodeView] of expansionView.nodeViewsById) {
    if (nodeView.sourceType === 'skill' && nodeView.node.kind === 'skill') {
      nodeIdToArtifactId.set(nodeId, nodeView.sourceId);
    }
  }

  // Build nodeId -> mitigates mapping for direct mitigation check
  const nodeIdToMitigates = new Map<string, string[]>();
  for (const [nodeId, nodeView] of expansionView.nodeViewsById) {
    if (
      nodeView.sourceType === 'skill' &&
      nodeView.node.kind === 'skill' &&
      nodeView.node.mitigates &&
      nodeView.node.mitigates.length > 0
    ) {
      nodeIdToMitigates.set(nodeId, nodeView.node.mitigates);
    }
  }

  const blockingSet = new Set(blockingTrapNodeIds);

  // Score candidates with mitigation boost
  const scoredCandidates = skillCandidates
    .map((candidate) => {
      const artifact = artifactById.get(candidate.artifactId);
      if (!artifact) return null;

      // Find node ID for this candidate
      let nodeId: string | null = null;
      for (const [nid, aid] of nodeIdToArtifactId) {
        if (aid === candidate.artifactId) {
          nodeId = nid;
          break;
        }
      }

      const precomputedMitigates = nodeId ? nodeIdToMitigates.get(nodeId) : undefined;
      const scopedMitigates =
        precomputedMitigates?.some((trapId) => blockingSet.has(trapId)) ?? false;
      const isMitigating = nodeId
        ? scopedMitigates || mitigatingSkillNodeIds.includes(nodeId)
        : false;
      const mitigationBoost = isMitigating ? 0.5 : 0;
      const prioritizedScore = candidate.finalScore + mitigationBoost;

      return {
        candidate,
        artifact,
        nodeId,
        prioritizedScore,
        isMitigating,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Sort by prioritized score (mitigating skills first among equal scores)
  scoredCandidates.sort((a, b) => {
    // Mitigating skills get priority
    if (a.isMitigating && !b.isMitigating) return -1;
    if (!a.isMitigating && b.isMitigating) return 1;
    return b.prioritizedScore - a.prioritizedScore;
  });

  // Limit to budget
  const selected = scoredCandidates.slice(0, budget);

  // Build PlanSkillNode objects
  return selected.map((item) => {
    const capsule = item.artifact.latestRevision.derived?.capsules.find(
      (c) => c.capsuleId === item.candidate.capsuleId,
    );
    const nodeRecord = item.nodeId ? expansionView.nodeViewsById.get(item.nodeId)?.node : undefined;

    return {
      nodeId: item.nodeId ?? `skill:${item.artifact.id}`,
      artifactId: item.artifact.id,
      capsuleId: item.candidate.capsuleId,
      label:
        capsule?.situation?.slice(0, 280) ??
        item.artifact.title ??
        nodeRecord?.label ??
        'Unknown skill',
      situation: capsule?.situation ?? '',
      problem: capsule?.problem ?? '',
      goal: capsule?.goal ?? '',
      scope: item.artifact.scope,
      requiredLevel: item.artifact.requiredLevel,
      score: item.candidate.finalScore,
      activationRefs: buildActivationRefs(item.artifact),
    };
  });
}

/**
 * Extract activation references from a skill artifact's client manifest.
 */
export function buildActivationRefs(
  artifact: SkillArtifactRecord,
): PlanSkillNode['activationRefs'] {
  const manifest = artifact.latestRevision.derived?.clientManifest;

  if (!manifest) {
    return {
      references: [],
      assets: [],
      scripts: [],
    };
  }

  return {
    references: manifest.references,
    assets: manifest.assets,
    scripts: manifest.scripts,
  };
}
