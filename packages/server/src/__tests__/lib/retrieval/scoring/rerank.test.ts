import {
  createMockArtifact,
  createMockCapsule,
} from '@trapmap/server/__tests__/lib/retrieval/test-helpers.js';
import { rerankMergedCapsules } from '@trapmap/server/lib/retrieval/capsules/scoring/rerank.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallChannelName,
  MergedCapsuleCandidate,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { describe, expect, it } from 'vitest';

function makeFilters(
  overrides: Partial<ArtifactGovernanceFilters> = {},
): ArtifactGovernanceFilters {
  return {
    teamId: null,
    securityLevel: 0,
    isSystemAdmin: true,
    scopes: [],
    labels: [],
    ...overrides,
  };
}

function makeMerged(
  overrides: Partial<MergedCapsuleCandidate> & { capsuleId: string; artifactId: string },
): MergedCapsuleCandidate {
  return {
    capsuleId: overrides.capsuleId,
    artifactId: overrides.artifactId,
    revision: overrides.revision ?? 1,
    channels: overrides.channels ?? ['capsule-heuristic'],
    channelScores: overrides.channelScores ?? { 'capsule-heuristic': 0.8 },
    preRerankScore: overrides.preRerankScore ?? 0.8,
    finalScore: overrides.finalScore ?? 0.8,
    reason: overrides.reason ?? '',
  };
}

function makeIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    seed: 'docker node version mismatch containers',
    normalized: 'docker node version mismatch containers',
    situation: 'deploying containers',
    problem: 'container node version mismatch',
    goal: 'pin node version in dockerfile',
    errorText: null,
    tokens: [
      { token: 'docker', original: 'docker', isTechnical: true },
      { token: 'node', original: 'node', isTechnical: true },
      { token: 'version', original: 'version', isTechnical: false },
      { token: 'container', original: 'containers', isTechnical: true },
    ],
    stackPathHints: [
      { hint: 'docker', kind: 'stack', confidence: 0.9 },
      { hint: 'node', kind: 'stack', confidence: 0.9 },
    ],
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
    ...overrides,
  };
}

describe('rerankMergedCapsules', () => {
  const capsule1 = createMockCapsule({
    capsuleId: 'c1',
    artifactId: 'a1',
    situation: 'When deploying containers with Node.js application',
    problem: 'Container Node version older than development version',
    goal: 'Pin Node version in Dockerfile to ensure consistency',
    labels: ['docker', 'node'],
    scope: 'global',
    requiredLevel: 0,
  });

  const capsule2 = createMockCapsule({
    capsuleId: 'c2',
    artifactId: 'a2',
    situation: 'When setting up TypeScript project',
    problem: 'Strict null checks causing compile errors',
    goal: 'Configure tsconfig with strictNullChecks',
    labels: ['typescript'],
    scope: 'global',
    requiredLevel: 0,
  });

  const artifacts: SkillArtifactRecord[] = [
    createMockArtifact({
      id: 'a1',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Docker Node Version',
      labels: ['docker', 'node'],
      capsules: [capsule1],
    }),
    createMockArtifact({
      id: 'a2',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'TypeScript Strict Nulls',
      labels: ['typescript'],
      capsules: [capsule2],
    }),
  ];

  it('should return CapsuleCandidate[] with correct shape', () => {
    const merged: MergedCapsuleCandidate[] = [
      makeMerged({
        capsuleId: 'c1',
        artifactId: 'a1',
        channels: ['capsule-heuristic' as CapsuleRecallChannelName],
        channelScores: { 'capsule-heuristic': 0.8 },
      }),
      makeMerged({
        capsuleId: 'c2',
        artifactId: 'a2',
        channels: ['capsule-keyword' as CapsuleRecallChannelName],
        channelScores: { 'capsule-keyword': 0.3 },
      }),
    ];

    const result = rerankMergedCapsules(merged, artifacts, makeIntent(), 10, makeFilters());

    expect(result).toBeInstanceOf(Array);

    for (const c of result) {
      expect(c).toHaveProperty('capsuleId');
      expect(c).toHaveProperty('artifactId');
      expect(c).toHaveProperty('revision');
      expect(c).toHaveProperty('situationScore');
      expect(c).toHaveProperty('problemScore');
      expect(c).toHaveProperty('goalScore');
      expect(c).toHaveProperty('finalScore');
      expect(c).toHaveProperty('reason');
      expect(c.finalScore).toBeGreaterThanOrEqual(0);
      expect(c.finalScore).toBeLessThanOrEqual(1);
    }
  });

  it('should respect maxResults', () => {
    const capsule3 = createMockCapsule({
      capsuleId: 'c3',
      artifactId: 'a3',
      situation: 'Python venv setup',
      problem: 'Python virtual environment not activated',
      goal: 'Create and activate venv',
      labels: ['python'],
      scope: 'global',
      requiredLevel: 0,
    });

    const allArtifacts = [
      ...artifacts,
      createMockArtifact({
        id: 'a3',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'Python Venv',
        labels: ['python'],
        capsules: [capsule3],
      }),
    ];

    const merged: MergedCapsuleCandidate[] = [
      makeMerged({ capsuleId: 'c1', artifactId: 'a1' }),
      makeMerged({ capsuleId: 'c2', artifactId: 'a2' }),
      makeMerged({ capsuleId: 'c3', artifactId: 'a3' }),
    ];

    const result = rerankMergedCapsules(merged, allArtifacts, makeIntent(), 1, makeFilters());

    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('should sort by finalScore descending', () => {
    const merged: MergedCapsuleCandidate[] = [
      makeMerged({ capsuleId: 'c1', artifactId: 'a1' }),
      makeMerged({ capsuleId: 'c2', artifactId: 'a2' }),
    ];

    const result = rerankMergedCapsules(merged, artifacts, makeIntent(), 10, makeFilters());

    if (result.length >= 2) {
      expect(result[0].finalScore).toBeGreaterThanOrEqual(result[1].finalScore);
    }
  });

  it('should prefer docker node capsules for docker query', () => {
    const merged: MergedCapsuleCandidate[] = [
      makeMerged({ capsuleId: 'c1', artifactId: 'a1' }),
      makeMerged({ capsuleId: 'c2', artifactId: 'a2' }),
    ];

    const result = rerankMergedCapsules(merged, artifacts, makeIntent(), 10, makeFilters());

    if (result.length >= 2) {
      // c1 (docker node) should rank higher than c2 (typescript)
      expect(result[0].capsuleId).toBe('c1');
    }
  });

  it('should include channel info in reason via multi-channel reason', () => {
    const merged: MergedCapsuleCandidate[] = [
      makeMerged({
        capsuleId: 'c1',
        artifactId: 'a1',
        channels: ['capsule-heuristic', 'capsule-keyword'] as CapsuleRecallChannelName[],
        channelScores: { 'capsule-heuristic': 0.8, 'capsule-keyword': 0.5 },
      }),
    ];

    const result = rerankMergedCapsules(merged, artifacts, makeIntent(), 10, makeFilters());

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].reason).toContain('Matched via');
    expect(result[0].reason).toContain('heuristic');
    expect(result[0].reason).toContain('keyword');
  });

  it('should skip merged candidates with no matching capsule data', () => {
    const merged: MergedCapsuleCandidate[] = [
      makeMerged({
        capsuleId: 'nonexistent',
        artifactId: 'a99',
        channels: ['capsule-heuristic' as CapsuleRecallChannelName],
      }),
      makeMerged({ capsuleId: 'c1', artifactId: 'a1' }),
    ];

    const result = rerankMergedCapsules(merged, artifacts, makeIntent(), 10, makeFilters());

    // Only c1 should be returned since 'nonexistent' has no capsule data
    expect(result.length).toBe(1);
    expect(result[0].capsuleId).toBe('c1');
  });

  it('should handle empty merged array', () => {
    const result = rerankMergedCapsules([], artifacts, makeIntent(), 10, makeFilters());

    expect(result).toEqual([]);
  });

  it('should handle empty artifacts array', () => {
    const merged: MergedCapsuleCandidate[] = [makeMerged({ capsuleId: 'c1', artifactId: 'a1' })];

    const result = rerankMergedCapsules(merged, [], makeIntent(), 10, makeFilters());

    expect(result).toEqual([]);
  });
});
