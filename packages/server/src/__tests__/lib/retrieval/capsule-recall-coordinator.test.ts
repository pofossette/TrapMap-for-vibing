import { beforeEach, describe, expect, it } from 'vitest';
import {
  CapsuleChannelRegistry,
  CapsuleRecallCoordinator,
} from '../../../lib/retrieval/capsules/index.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallCandidate,
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
  MergedCapsuleCandidate,
  ParsedIntent,
} from '../../../lib/retrieval/types.js';
import type { SkillArtifactRecord } from '../../../lib/store.js';
import { createMockArtifact, createMockCapsule } from './test-helpers.js';

describe('CapsuleRecallCoordinator', () => {
  let registry: CapsuleChannelRegistry;
  let coordinator: CapsuleRecallCoordinator;
  let artifacts: SkillArtifactRecord[];
  let intent: ParsedIntent;
  let governanceFilters: ArtifactGovernanceFilters;

  beforeEach(() => {
    registry = new CapsuleChannelRegistry();
    coordinator = new CapsuleRecallCoordinator(registry);

    artifacts = [
      createMockArtifact({
        id: 'artifact_1',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'Docker Node Version Mismatch',
        labels: ['docker', 'node', 'version'],
        capsules: [
          createMockCapsule({
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            situation: 'When deploying containers with a Node.js application',
            problem: 'Container Node version older than development version',
            goal: 'Pin Node version in Dockerfile',
            labels: ['docker', 'node'],
            scope: 'global',
            requiredLevel: 0,
          }),
        ],
      }),
    ];

    intent = {
      seed: 'docker node version mismatch containers',
      normalized: 'docker node version mismatch containers',
      situation: 'When deploying containers with a Node.js application',
      problem: 'Container Node version older than development version',
      goal: 'Pin Node version in Dockerfile',
      errorText: null,
      tokens: [
        { token: 'docker', original: 'docker', isTechnical: true },
        { token: 'node', original: 'node', isTechnical: true },
        { token: 'version', original: 'version', isTechnical: false },
      ],
      stackPathHints: [
        { hint: 'docker', kind: 'stack', confidence: 0.9 },
        { hint: 'node', kind: 'stack', confidence: 0.9 },
      ],
    };

    governanceFilters = {
      teamId: 'team_1',
      securityLevel: 5,
      isSystemAdmin: false,
    };
  });

  it('should return capsule candidates with heuristic channel', async () => {
    const mockChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            channel: 'capsule-heuristic' as CapsuleRecallChannelName,
            score: 0.5,
          },
        ];
      },
    };
    registry.register(mockChannel);

    const result = await coordinator.execute({
      artifacts: [],
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.capsuleCandidates).toBeInstanceOf(Array);
    expect(result.mergedCandidates).toBeInstanceOf(Array);
  });

  it('should produce capsuleCandidates with correct shape', async () => {
    const mockChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };
    registry.register(mockChannel);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.capsuleCandidates.length).toBeGreaterThanOrEqual(0);

    for (const c of result.capsuleCandidates) {
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

  it('should produce mergedCandidates with correct shape', async () => {
    const mockChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };
    registry.register(mockChannel);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.mergedCandidates.length).toBe(result.capsuleCandidates.length);

    for (const c of result.mergedCandidates) {
      expect(c).toHaveProperty('capsuleId');
      expect(c).toHaveProperty('artifactId');
      expect(c).toHaveProperty('revision');
      expect(c).toHaveProperty('channels');
      expect(c).toHaveProperty('channelScores');
      expect(c).toHaveProperty('preRerankScore');
      expect(c).toHaveProperty('finalScore');
      expect(c).toHaveProperty('reason');
      expect(Array.isArray(c.channels)).toBe(true);
      expect(c.channels.length).toBeGreaterThan(0);
    }
  });

  it('should respect maxResults', async () => {
    // Create multiple artifacts to test maxResults
    const multiArtifacts = [
      ...artifacts,
      createMockArtifact({
        id: 'artifact_2',
        teamId: null,
        scope: 'global',
        lifecycleState: 'approved',
        requiredLevel: 0,
        title: 'TypeScript Strict Null Checks',
        labels: ['typescript', 'null', 'strict'],
        capsules: [
          createMockCapsule({
            capsuleId: 'capsule_2',
            artifactId: 'artifact_2',
            situation: 'When enabling TypeScript strict mode',
            problem: 'Null reference errors at compile time',
            goal: 'Enable strictNullChecks in tsconfig',
            labels: ['typescript'],
            scope: 'global',
            requiredLevel: 0,
          }),
        ],
      }),
    ];

    const mockChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };
    registry.register(mockChannel);

    const result = await coordinator.execute({
      artifacts: multiArtifacts,
      intent,
      governanceFilters,
      maxResults: 1,
    });

    expect(result.capsuleCandidates.length).toBeLessThanOrEqual(1);
    expect(result.mergedCandidates.length).toBeLessThanOrEqual(1);
  });

  it('should handle empty artifacts gracefully', async () => {
    const mockChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [];
      },
    };
    registry.register(mockChannel);

    const result = await coordinator.execute({
      artifacts: [],
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.capsuleCandidates).toEqual([]);
    expect(result.mergedCandidates).toEqual([]);
  });

  it('should handle empty registry (no channels)', async () => {
    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    // Should still produce valid output with heuristic as default channel label
    expect(result.capsuleCandidates).toBeInstanceOf(Array);
    expect(result.mergedCandidates).toBeInstanceOf(Array);

    for (const c of result.mergedCandidates) {
      expect(c.channels).toContain('capsule-heuristic');
    }
  });

  it('should collect channel recall candidates from all registered channels', async () => {
    const channel1Candidates: CapsuleRecallCandidate[] = [
      {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        channel: 'capsule-heuristic' as CapsuleRecallChannelName,
        score: 0.8,
      },
    ];
    const channel2Candidates: CapsuleRecallCandidate[] = [
      {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        channel: 'capsule-keyword' as CapsuleRecallChannelName,
        score: 0.6,
      },
    ];

    const channel1: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return channel1Candidates;
      },
    };
    const channel2: CapsuleRecallChannel = {
      name: 'capsule-keyword' as CapsuleRecallChannelName,
      async recall() {
        return channel2Candidates;
      },
    };

    registry.register(channel1);
    registry.register(channel2);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    // Each merged candidate should potentially list multiple channels
    for (const c of result.mergedCandidates) {
      expect(c.channelScores).toBeDefined();
    }
  });

  it('should isolate channel failures and record them', async () => {
    const failingChannel: CapsuleRecallChannel = {
      name: 'capsule-keyword' as CapsuleRecallChannelName,
      async recall() {
        throw new Error('PG connection refused');
      },
    };
    const workingChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            channel: 'capsule-heuristic' as CapsuleRecallChannelName,
            score: 0.5,
          },
        ];
      },
    };

    registry.register(workingChannel);
    registry.register(failingChannel);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.channelsPlanned).toContain('capsule-keyword');
    expect(result.channelsFailed).toContain('capsule-keyword');
    expect(result.capsuleCandidates.length).toBeGreaterThanOrEqual(0);
    expect(result.mergeStats).toBeDefined();
  });

  it('should return empty array for channel that throws', async () => {
    const failingChannel: CapsuleRecallChannel = {
      name: 'capsule-semantic' as CapsuleRecallChannelName,
      async recall() {
        throw new Error('Embedding service timeout');
      },
    };

    registry.register(failingChannel);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.channelsPlanned).toContain('capsule-semantic');
    expect(result.channelsFailed).toContain('capsule-semantic');
    expect(result.channelErrors['capsule-semantic']).toBeDefined();
    // Execution should still complete despite channel failure
    expect(result.mergeStats).toBeDefined();
  });

  it('should not lose results from working channels when others fail', async () => {
    const failingChannel: CapsuleRecallChannel = {
      name: 'capsule-keyword' as CapsuleRecallChannelName,
      async recall() {
        throw new Error('Boom');
      },
    };
    const heuristicChannel: CapsuleRecallChannel = {
      name: 'capsule-heuristic' as CapsuleRecallChannelName,
      async recall() {
        return [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            channel: 'capsule-heuristic' as CapsuleRecallChannelName,
            score: 0.7,
          },
        ];
      },
    };

    registry.register(heuristicChannel);
    registry.register(failingChannel);

    const result = await coordinator.execute({
      artifacts,
      intent,
      governanceFilters,
      maxResults: 10,
    });

    expect(result.channelsFailed).toContain('capsule-keyword');
    expect(result.channelsUsed).toContain('capsule-heuristic');
    expect(result.mergeStats.totalChannelCandidates).toBeGreaterThanOrEqual(1);
  });
});
