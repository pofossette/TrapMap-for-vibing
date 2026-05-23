import {
  computeContextMatchScore,
  computeErrorScore,
  computeGoalScore,
  computeKeywordScore,
  computeProblemScore,
  computeSituationScore,
  computeStackPathBoost,
  extractGovernedCapsules,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleCandidate,
  MergedCapsuleCandidate,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { DerivedSkillCapsuleRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { buildMultiChannelReason } from './reasons.js';

export interface CapsuleDataLookup {
  capsule: DerivedSkillCapsuleRecord;
}

function buildCapsuleDataMap(artifacts: SkillArtifactRecord[]): Map<string, CapsuleDataLookup> {
  const map = new Map<string, CapsuleDataLookup>();
  for (const artifact of artifacts) {
    const capsules = artifact.latestRevision.derived?.capsules;
    if (!capsules) continue;
    for (const capsule of capsules) {
      map.set(capsule.capsuleId, { capsule });
    }
  }
  return map;
}

export function rerankMergedCapsules(
  merged: MergedCapsuleCandidate[],
  artifacts: SkillArtifactRecord[],
  intent: ParsedIntent,
  maxResults: number,
  filters: ArtifactGovernanceFilters,
): CapsuleCandidate[] {
  const governedIds = new Set(
    extractGovernedCapsules(artifacts, filters).map((g) => g.capsule.capsuleId),
  );

  const capsuleDataMap = buildCapsuleDataMap(artifacts);

  const candidates: CapsuleCandidate[] = [];

  for (const mc of merged) {
    const data = capsuleDataMap.get(mc.capsuleId);
    if (!data) continue;
    if (!governedIds.has(mc.capsuleId)) continue;

    const { capsule } = data;

    const situationScore = computeSituationScore(intent, capsule);
    const problemScore = computeProblemScore(intent, capsule);
    const goalScore = computeGoalScore(intent, capsule);
    const errorScore = computeErrorScore(intent, capsule);
    const keywordScore = computeKeywordScore(intent, capsule);
    const contextScore = computeContextMatchScore(intent, capsule);
    const stackPathBoost = computeStackPathBoost(intent, capsule);

    const baseScore =
      problemScore * 0.3 +
      situationScore * 0.21 +
      goalScore * 0.17 +
      keywordScore * 0.17 +
      contextScore * 0.15;

    const finalScore = Math.min(1, baseScore * stackPathBoost);

    const reason = buildMultiChannelReason(
      mc.channels,
      {
        problemScore,
        situationScore,
        goalScore,
        keywordScore,
        contextScore,
        stackPathBoost,
      },
      capsule,
      intent,
    );

    candidates.push({
      capsuleId: mc.capsuleId,
      artifactId: mc.artifactId,
      revision: mc.revision,
      situationScore,
      problemScore,
      goalScore,
      errorScore,
      contextScore,
      stackPathBoost,
      finalScore,
      reason,
    });
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);

  return candidates.slice(0, maxResults);
}
