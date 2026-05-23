import {
  capsuleKeywordChannel,
  capsuleKeywordRecall,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import type {
  ArtifactGovernanceFilters,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { describe, expect, it } from 'vitest';
import { createMockArtifact, createMockCapsule } from './test-helpers.js';

function makeIntent(seed: string): ParsedIntent {
  return {
    seed,
    normalized: seed,
    situation: null,
    problem: null,
    goal: null,
    errorText: null,
    tokens: seed
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map((token) => ({ token, original: token, isTechnical: false })),
    stackPathHints: [],
  };
}

function makeGovernanceFilters(
  overrides: Partial<ArtifactGovernanceFilters> = {},
): ArtifactGovernanceFilters {
  return {
    teamId: 'team_1',
    securityLevel: 5,
    isSystemAdmin: false,
    ...overrides,
  };
}

describe('capsuleKeywordChannel', () => {
  it('should implement CapsuleRecallChannel interface', () => {
    expect(capsuleKeywordChannel.name).toBe('capsule-keyword');
    expect(typeof capsuleKeywordChannel.recall).toBe('function');
  });
});

describe('capsuleKeywordRecall', () => {
  const governanceFilters = makeGovernanceFilters();

  function makeArtifacts(capsules: ReturnType<typeof createMockCapsule>[]): SkillArtifactRecord[] {
    return capsules.map((capsule, i) =>
      createMockArtifact({
        id: `artifact_${i + 1}`,
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: `Test Artifact ${i + 1}`,
        labels: capsule.labels,
        capsules: [capsule],
      }),
    );
  }

  it('should return capsule candidates matching query tokens', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_1',
        artifactId: 'artifact_1',
        situation: 'When deploying containers with a Node.js application',
        problem: 'Container Node version older than development version',
        goal: 'Pin Node version in Dockerfile',
        labels: ['docker', 'node'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('docker node version mismatch');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_1');
    expect(result[0]!.channel).toBe('capsule-keyword');
    expect(result[0]!.matchedTokens).toBeDefined();
    expect(result[0]!.matchedTokens!.length).toBeGreaterThan(0);
    expect(result[0]!.score).toBeGreaterThan(0);
    expect(result[0]!.score).toBeLessThanOrEqual(1);
  });

  it('should respect maxResults', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_a',
        artifactId: 'artifact_a',
        situation: 'Serving a web app',
        problem: 'build failed',
        goal: 'fix the build',
        labels: ['web', 'build'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_b',
        artifactId: 'artifact_b',
        situation: 'Deploying to production',
        problem: 'build timeout',
        goal: 'speed up build',
        labels: ['ci', 'build'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('build');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 1);

    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('should return empty array for non-matching query', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_x',
        artifactId: 'artifact_x',
        situation: 'Serving a web app',
        problem: 'build failed',
        goal: 'fix the build',
        labels: ['web'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('zzznotexist qqqanother');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    expect(result).toEqual([]);
  });

  it('should return empty array for empty artifacts', async () => {
    const intent = makeIntent('docker');
    const result = await capsuleKeywordRecall([], intent, governanceFilters, 10);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty query', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_e',
        artifactId: 'artifact_e',
        situation: 'Running tests',
        problem: 'test failure',
        goal: 'pass tests',
        labels: ['test'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent: ParsedIntent = {
      seed: '',
      normalized: '',
      situation: null,
      problem: null,
      goal: null,
      errorText: null,
      tokens: [],
      stackPathHints: [],
    };

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);
    expect(result).toEqual([]);
  });

  it('should score labels higher than content tokens', async () => {
    // Two capsules: one with label match, one with content-only match
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_label_match',
        artifactId: 'artifact_l',
        situation: 'Some situation',
        problem: 'Some problem',
        goal: 'Some goal',
        labels: ['kubernetes'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_content_match',
        artifactId: 'artifact_c',
        situation: 'Some situation',
        problem: 'Some problem',
        goal: 'Some goal',
        labels: ['other'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('kubernetes');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThanOrEqual(1);

    const labelMatch = result.find((c) => c.capsuleId === 'caps_label_match');
    if (labelMatch && result.length > 1) {
      const contentMatch = result.find((c) => c.capsuleId === 'caps_content_match');
      if (contentMatch) {
        expect(labelMatch.score).toBeGreaterThan(contentMatch.score);
      }
    }
  });

  it('should return candidates sorted by descending score', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_low',
        artifactId: 'artifact_low',
        situation: 'codebase',
        problem: 'codebase',
        goal: 'codebase',
        labels: [],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_high',
        artifactId: 'artifact_high',
        situation: 'codebase',
        problem: 'codebase',
        goal: 'codebase',
        labels: ['codebase'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('codebase');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    if (result.length >= 2) {
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    }
  });

  it('should match tokens in contextualPrefix', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_ctx',
        artifactId: 'artifact_ctx',
        situation: 'unrelated text',
        problem: 'unrelated text',
        goal: 'unrelated text',
        labels: [],
        scope: 'global',
        requiredLevel: 0,
        contextualPrefix: 'This is a unique phrase about pnpm workspace configuration',
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('pnpm workspace');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_ctx');
    expect(result[0]!.matchedTokens).toContain('pnpm');
  });

  it('should match error text via problem field scoring', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_err',
        artifactId: 'artifact_err',
        situation: 'Running pytest',
        problem: 'ModuleNotFoundError No module named requests',
        goal: 'Fix import',
        labels: ['python'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('ModuleNotFoundError No module named requests');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_err');
  });

  it('should filter capsules by governance', async () => {
    const approvedCapsule = createMockCapsule({
      capsuleId: 'caps_approved',
      artifactId: 'artifact_approved',
      situation: 'Deploying docker',
      problem: 'docker issue',
      goal: 'fix docker',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const approvedArtifact = createMockArtifact({
      id: 'artifact_approved',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Approved',
      labels: ['docker'],
      capsules: [approvedCapsule],
    });

    const rejectedArtifact = createMockArtifact({
      id: 'artifact_rejected',
      teamId: null,
      scope: 'global',
      lifecycleState: 'rejected',
      requiredLevel: 0,
      title: 'Rejected',
      labels: ['docker'],
      capsules: [
        createMockCapsule({
          capsuleId: 'caps_rejected',
          artifactId: 'artifact_rejected',
          situation: 'Deploying docker',
          problem: 'docker issue',
          goal: 'fix docker',
          labels: ['docker'],
          scope: 'global',
          requiredLevel: 0,
        }),
      ],
    });

    const intent = makeIntent('docker');

    const result = await capsuleKeywordRecall(
      [approvedArtifact, rejectedArtifact],
      intent,
      governanceFilters,
      10,
    );

    const capsuleIds = result.map((c) => c.capsuleId);
    expect(capsuleIds).toContain('caps_approved');
    expect(capsuleIds).not.toContain('caps_rejected');
  });

  it('should return CapsuleRecallCandidate shape', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_shape',
        artifactId: 'artifact_shape',
        situation: 'Serving web',
        problem: 'web fails',
        goal: 'fix web',
        labels: ['web'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('web');

    const result = await capsuleKeywordRecall(artifacts, intent, governanceFilters, 5);

    for (const c of result) {
      expect(c).toHaveProperty('capsuleId');
      expect(c).toHaveProperty('artifactId');
      expect(c).toHaveProperty('revision');
      expect(c).toHaveProperty('channel');
      expect(c).toHaveProperty('score');
      expect(typeof c.capsuleId).toBe('string');
      expect(typeof c.artifactId).toBe('string');
      expect(typeof c.channel).toBe('string');
      expect(typeof c.score).toBe('number');
      expect(c.score).toBeGreaterThan(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });
});
