import {
  MIN_CAPSULE_SCORE,
  rankCapsules,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallCandidate,
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

/**
 * Capsule heuristic recall channel.
 *
 * Wraps the existing rankCapsules() scoring pipeline as a recall channel.
 * In Phase 1, this is the only channel and provides backward-compatible behavior.
 * In future phases, this channel will serve as fallback and feature extractor.
 */
export const capsuleHeuristicChannel: CapsuleRecallChannel = {
  name: 'capsule-heuristic' as CapsuleRecallChannelName,

  async recall(
    artifacts: SkillArtifactRecord[],
    intent: ParsedIntent,
    filters: ArtifactGovernanceFilters,
    maxResults: number,
  ): Promise<CapsuleRecallCandidate[]> {
    const ranked = rankCapsules(artifacts, intent, filters, maxResults * 2);

    return ranked
      .filter((candidate) => candidate.finalScore >= MIN_CAPSULE_SCORE)
      .map((candidate) => ({
        capsuleId: candidate.capsuleId,
        artifactId: candidate.artifactId,
        revision: candidate.revision,
        channel: 'capsule-heuristic' as CapsuleRecallChannelName,
        score: candidate.finalScore,
      }));
  },
};
