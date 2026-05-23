import type { DerivedSkillCapsuleRecord, SkillArtifactRecord } from '../../../store.js';
import type { CapsuleCandidate, MergedCapsuleCandidate, ParsedIntent } from '../../types.js';
import {
  computeContextMatchScore,
  computeErrorScore,
  computeGoalScore,
  computeKeywordScore,
  computeProblemScore,
  computeSituationScore,
  computeStackPathBoost,
  extractGovernedCapsules,
} from '../capsule-recall.js';
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
): CapsuleCandidate[] {
  const governedIds = new Set(
    extractGovernedCapsules(artifacts, {
      teamId: null,
      securityLevel: 0,
      isSystemAdmin: true,
    }).map((g) => g.capsule.capsuleId),
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
