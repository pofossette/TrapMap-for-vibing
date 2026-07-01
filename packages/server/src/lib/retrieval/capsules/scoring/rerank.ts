import {
  MIN_CAPSULE_SCORE,
  computeArtifactKeywordScore,
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

interface CapsuleDataLookup {
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
  options?: { allowWeakBackfill?: boolean },
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
    const artifact = artifacts.find((item) => item.id === mc.artifactId);
    if (!artifact) continue;

    const situationScore = computeSituationScore(intent, capsule);
    const problemScore = computeProblemScore(intent, capsule);
    const goalScore = computeGoalScore(intent, capsule);
    const errorScore = computeErrorScore(intent, capsule);
    const keywordScore = Math.max(
      computeKeywordScore(intent, capsule),
      computeArtifactKeywordScore(intent, artifact),
    );
    const contextScore = computeContextMatchScore(intent, capsule);
    const stackPathBoost = computeStackPathBoost(intent, capsule);

    const errorWeightedScore = errorScore === null ? 0 : errorScore * 0.12;
    const baseScore =
      problemScore * 0.3 +
      situationScore * 0.21 +
      goalScore * 0.17 +
      keywordScore * 0.17 +
      contextScore * 0.15 +
      errorWeightedScore;

    const channelConsensusBoost = Math.min(mc.channels.length * 0.04, 0.12);
    const semanticBoost = (mc.channelScores['capsule-semantic'] ?? 0) * 0.2;
    const graphBoost = (mc.channelScores['capsule-graph'] ?? 0) * 0.1;
    const blendedScore =
      baseScore * 0.65 +
      mc.preRerankScore * 0.2 +
      semanticBoost +
      graphBoost +
      channelConsensusBoost;

    const finalScore = Math.min(1, blendedScore * stackPathBoost);

    const reason = buildMultiChannelReason(
      mc.channels,
      {
        problemScore,
        situationScore,
        goalScore,
        keywordScore,
        contextScore,
        stackPathBoost,
        channelConsensusBoost,
        semanticBoost,
        graphBoost,
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

  const thresholdMatches = candidates.filter((c) => c.finalScore >= MIN_CAPSULE_SCORE);
  if (thresholdMatches.length > 0) {
    if (thresholdMatches.length >= maxResults) {
      return thresholdMatches.slice(0, maxResults);
    }

    if (!options?.allowWeakBackfill) {
      return thresholdMatches.slice(0, maxResults);
    }

    const seen = new Set(thresholdMatches.map((candidate) => candidate.capsuleId));
    const backfill = candidates.filter((candidate) => !seen.has(candidate.capsuleId));
    return [...thresholdMatches, ...backfill].slice(0, maxResults);
  }

  // Preserve the strongest weak matches when recall found governed candidates
  // but all scores fall below the global threshold. This keeps v2 useful for
  // broad, natural-language debugging/setup queries that need a few supporting
  // capsules instead of an empty response.
  return options?.allowWeakBackfill ? candidates.slice(0, maxResults) : [];
}
