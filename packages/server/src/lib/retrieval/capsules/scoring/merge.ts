import type {
  CapsuleRecallCandidate,
  CapsuleRecallChannelName,
  MergedCapsuleCandidate,
} from '../../types.js';

const DEFAULT_RRF_K = 60;

function buildRanks(
  channelResults: CapsuleRecallCandidate[][],
): Map<string, Map<CapsuleRecallChannelName, number>> {
  const ranks = new Map<string, Map<CapsuleRecallChannelName, number>>();
  for (const candidates of channelResults) {
    let rank = 1;
    for (const c of candidates) {
      let capsuleRanks = ranks.get(c.capsuleId);
      if (!capsuleRanks) {
        capsuleRanks = new Map();
        ranks.set(c.capsuleId, capsuleRanks);
      }
      capsuleRanks.set(c.channel, rank);
      rank++;
    }
  }
  return ranks;
}

export function mergeCapsuleCandidates(
  channelResults: CapsuleRecallCandidate[][],
  options?: { rrfK?: number },
): MergedCapsuleCandidate[] {
  const k = options?.rrfK ?? DEFAULT_RRF_K;
  const ranks = buildRanks(channelResults);

  const byCapsuleId = new Map<string, CapsuleRecallCandidate[]>();
  for (const candidates of channelResults) {
    for (const c of candidates) {
      const existing = byCapsuleId.get(c.capsuleId) ?? [];
      existing.push(c);
      byCapsuleId.set(c.capsuleId, existing);
    }
  }

  const merged: MergedCapsuleCandidate[] = [];

  for (const [capsuleId, candidates] of byCapsuleId) {
    const channels: CapsuleRecallChannelName[] = [];
    const channelScores: Partial<Record<CapsuleRecallChannelName, number>> = {};

    for (const c of candidates) {
      channels.push(c.channel);
      (channelScores as Record<string, number>)[c.channel] = c.score;
    }

    const capsuleRanks = ranks.get(capsuleId);
    let rrfScore = 0;
    for (const c of candidates) {
      const rank = capsuleRanks?.get(c.channel) ?? 999;
      rrfScore += 1 / (k + rank);
    }

    merged.push({
      capsuleId,
      artifactId: candidates[0].artifactId,
      revision: candidates[0].revision,
      channels,
      channelScores,
      preRerankScore: rrfScore,
      finalScore: rrfScore,
      reason: '',
    });
  }

  return merged;
}
