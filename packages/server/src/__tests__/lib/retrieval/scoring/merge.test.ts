import { describe, expect, it } from 'vitest';
import { mergeCapsuleCandidates } from '../../../../lib/retrieval/capsules/scoring/merge.js';
import type {
  CapsuleRecallCandidate,
  CapsuleRecallChannelName,
} from '../../../../lib/retrieval/types.js';

function makeCandidate(
  overrides: Partial<CapsuleRecallCandidate> & {
    capsuleId: string;
    channel: CapsuleRecallChannelName;
    score: number;
  },
): CapsuleRecallCandidate {
  return {
    capsuleId: overrides.capsuleId,
    artifactId: overrides.artifactId ?? `artifact_${overrides.capsuleId}`,
    revision: overrides.revision ?? 1,
    channel: overrides.channel,
    score: overrides.score,
  };
}

describe('mergeCapsuleCandidates', () => {
  it('should deduplicate by capsuleId', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [
        makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.8 }),
        makeCandidate({ capsuleId: 'c2', channel: 'capsule-heuristic', score: 0.6 }),
      ],
      [
        makeCandidate({ capsuleId: 'c1', channel: 'capsule-keyword', score: 0.5 }),
        makeCandidate({ capsuleId: 'c3', channel: 'capsule-keyword', score: 0.7 }),
      ],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged.length).toBe(3); // c1, c2, c3 (c1 deduped)

    const c1 = merged.find((m) => m.capsuleId === 'c1');
    expect(c1).toBeDefined();
    expect(c1!.channels).toContain('capsule-heuristic');
    expect(c1!.channels).toContain('capsule-keyword');
    expect(c1!.channelScores['capsule-heuristic']).toBe(0.8);
    expect(c1!.channelScores['capsule-keyword']).toBe(0.5);
  });

  it('should return empty array for empty channel results', () => {
    const merged = mergeCapsuleCandidates([]);
    expect(merged).toEqual([]);
  });

  it('should handle single channel with single candidate', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.9 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged.length).toBe(1);
    expect(merged[0].capsuleId).toBe('c1');
    expect(merged[0].channels).toEqual(['capsule-heuristic']);
    expect(merged[0].channelScores['capsule-heuristic']).toBe(0.9);
  });

  it('should compute RRF preRerankScore', () => {
    // Two channels both include c1 at rank 1
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.9 })],
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-keyword', score: 0.7 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged.length).toBe(1);
    // RRF: 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.0328
    expect(merged[0].preRerankScore).toBeCloseTo(2 / 61);
    expect(merged[0].finalScore).toBeCloseTo(2 / 61);
  });

  it('should handle candidates at different ranks producing different RRF scores', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [
        makeCandidate({ capsuleId: 'top', channel: 'capsule-heuristic', score: 0.9 }),
        makeCandidate({ capsuleId: 'mid', channel: 'capsule-heuristic', score: 0.5 }),
      ],
      [makeCandidate({ capsuleId: 'top', channel: 'capsule-keyword', score: 0.7 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    // top: rank 1 in heuristic + rank 1 in keyword = 1/61 + 1/61 ≈ 0.0328
    // mid: rank 2 in heuristic = 1/62 ≈ 0.0161
    const top = merged.find((m) => m.capsuleId === 'top')!;
    const midCandidate = merged.find((m) => m.capsuleId === 'mid')!;

    expect(top.preRerankScore).toBeCloseTo(1 / 61 + 1 / 61);
    expect(midCandidate.preRerankScore).toBeCloseTo(1 / 62);
  });

  it('should preserve channelScores for all channels', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.8 })],
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-keyword', score: 0.6 })],
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-semantic', score: 0.4 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged.length).toBe(1);
    expect(merged[0].channelScores['capsule-heuristic']).toBe(0.8);
    expect(merged[0].channelScores['capsule-keyword']).toBe(0.6);
    expect(merged[0].channelScores['capsule-semantic']).toBe(0.4);
    expect(merged[0].channels).toHaveLength(3);
  });

  it('should use custom rrfK value', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.9 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults, { rrfK: 10 });

    // RRF: 1/(10+1) = 1/11 ≈ 0.0909
    expect(merged[0].preRerankScore).toBeCloseTo(1 / 11);
  });

  it('should handle empty channel arrays', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.8 })],
      [],
      [makeCandidate({ capsuleId: 'c2', channel: 'capsule-keyword', score: 0.5 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged.length).toBe(2);
  });

  it('should set reason to empty string initially', () => {
    const channelResults: CapsuleRecallCandidate[][] = [
      [makeCandidate({ capsuleId: 'c1', channel: 'capsule-heuristic', score: 0.8 })],
    ];

    const merged = mergeCapsuleCandidates(channelResults);

    expect(merged[0].reason).toBe('');
  });
});
