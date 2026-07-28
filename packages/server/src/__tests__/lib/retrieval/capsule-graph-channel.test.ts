import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import { buildGraphRuntimeSnapshot, expandSourcesOneHop } from '@trapmap/service-knowledge-read';
import type { GraphIndexDocumentRecord } from '@trapmap/contracts';
import { createCapsuleGraphChannel } from '@trapmap/server/lib/retrieval/capsules/index.js';
import { normalizeQueryGraphLabels } from '@trapmap/server/lib/retrieval/recall/query-graph-labels.js';
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
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
  };
}

function makeGovernanceFilters(
  overrides: Partial<ArtifactGovernanceFilters> = {},
): ArtifactGovernanceFilters {
  return {
    teamId: 'team_1',
    securityLevel: 5,
    isSystemAdmin: false,
    scopes: [],
    labels: [],
    ...overrides,
  };
}

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

function makeGraphDoc(
  artifactId: string,
  labels: string[],
): {
  id: string;
  sourceType: 'skill';
  sourceId: string;
  revision: number;
  contentHash: string;
  teamId: string | null;
  scope: 'global';
  requiredLevel: number;
  nodes: Array<{ id: string; kind: string; label: string; evidence: string }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    relationType: string;
    strength: string;
    evidence: string;
  }>;
  evidence: string;
  createdAt: string;
  updatedAt: string;
} {
  const now = new Date().toISOString();
  return {
    id: `graphdoc_skill_${artifactId}_r1`,
    sourceType: 'skill' as const,
    sourceId: artifactId,
    revision: 1,
    contentHash: 'a'.repeat(64),
    teamId: null,
    scope: 'global' as const,
    requiredLevel: 0,
    nodes: labels.map((label) => ({
      id: `node_${label}`,
      kind: 'tool' as const,
      label,
      evidence: `tool keyword: ${label}`,
    })),
    edges: [
      ...(labels.length > 1
        ? [
            {
              id: `edge_${labels[0]}_${labels[1]}`,
              sourceNodeId: `node_${labels[0]}`,
              targetNodeId: `node_${labels[1]}`,
              relationType: 'co-occurs-with' as const,
              strength: 'soft' as const,
              evidence: 'co-occurs',
            },
          ]
        : []),
      {
        id: `edge_trap_${artifactId}`,
        sourceNodeId: `trap:${artifactId}`,
        targetNodeId: `node_${labels[0]}`,
        relationType: 'requires' as const,
        strength: 'hard' as const,
        evidence: 'requires tool',
      },
    ],
    evidence: `doc for ${artifactId}`,
    createdAt: now,
    updatedAt: now,
  };
}

function createMockGraphIndexRepository(
  docs: ReturnType<typeof makeGraphDoc>[],
): GraphIndexRepositoryPort {
  return {
    insert: () => Promise.resolve(),
    getById: () => Promise.resolve(null),
    listBySource: () => Promise.resolve([]),
    listAll: () => Promise.resolve(docs),
    upsert: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    removeBySource: () => Promise.resolve(),
  };
}

describe('capsuleGraphChannel', () => {
  const governanceFilters = makeGovernanceFilters();

  describe('graph runtime', () => {
    it('should expand sources for matching node labels', () => {
      const doc: GraphIndexDocumentRecord = {
        id: 'graphdoc_skill_art_1_r1',
        sourceType: 'skill',
        sourceId: 'artifact_1',
        revision: 1,
        contentHash: 'a'.repeat(64),
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [{ id: 'node_jest', kind: 'tool', label: 'jest', evidence: 'tool keyword: jest' }],
        edges: [
          {
            id: 'edge_1',
            sourceNodeId: 'trap:artifact_1',
            targetNodeId: 'node_jest',
            relationType: 'requires',
            strength: 'hard',
            evidence: 'requires jest',
          },
        ],
        evidence: 'test doc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const runtime = buildGraphRuntimeSnapshot([doc]);
      const expanded = expandSourcesOneHop(runtime, new Set(['jest']));
      expect(expanded.has('artifact_1')).toBe(true);
    });

    it('should expand sources for vitest label', () => {
      const doc: GraphIndexDocumentRecord = {
        id: 'graphdoc_skill_art_2_r1',
        sourceType: 'skill',
        sourceId: 'artifact_2',
        revision: 1,
        contentHash: 'b'.repeat(64),
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        nodes: [
          { id: 'node_vitest', kind: 'tool', label: 'vitest', evidence: 'tool keyword: vitest' },
        ],
        edges: [
          {
            id: 'edge_2',
            sourceNodeId: 'trap:artifact_2',
            targetNodeId: 'node_vitest',
            relationType: 'requires',
            strength: 'hard',
            evidence: 'requires vitest',
          },
        ],
        evidence: 'test doc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const runtime = buildGraphRuntimeSnapshot([doc]);
      const expanded = expandSourcesOneHop(runtime, new Set(['vitest']));
      expect(expanded.has('artifact_2')).toBe(true);
    });
  });

  describe('query label normalization', () => {
    it('normalizes simple tool labels', () => {
      expect(normalizeQueryGraphLabels('jest')).toEqual(new Set(['jest']));
      expect(normalizeQueryGraphLabels('docker')).toEqual(new Set(['docker']));
      expect(normalizeQueryGraphLabels('vitest')).toEqual(new Set(['vitest']));
    });

    it('removes stop words and keeps useful tokens', () => {
      expect(normalizeQueryGraphLabels('how to use vitest with docker')).toEqual(
        new Set(['vitest', 'docker']),
      );
    });
  });

  it('should implement CapsuleRecallChannel interface', () => {
    const repo = createMockGraphIndexRepository([]);
    const channel = createCapsuleGraphChannel(repo);
    expect(channel.name).toBe('capsule-graph');
    expect(typeof channel.recall).toBe('function');
  });

  it('should return candidates when graph documents match query entities', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_graph_1',
      artifactId: 'artifact_1',
      situation: 'Setting up a build pipeline with vitest',
      problem: 'vitest configuration errors',
      goal: 'Configure vitest correctly',
      labels: ['vitest', 'testing'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent = makeIntent('vitest configuration');

    const graphDocs = [makeGraphDoc('artifact_1', ['vitest', 'testing'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_graph_1');
    expect(result[0]!.channel).toBe('capsule-graph');
    expect(result[0]!.score).toBeGreaterThan(0);
    expect(result[0]!.score).toBeLessThanOrEqual(1);
    expect(result[0]!.graphEvidence).toBeDefined();
    expect(result[0]!.graphEvidence!.length).toBeGreaterThan(0);
  });

  it('should return candidates with jest keyword', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_jest',
      artifactId: 'artifact_jest',
      situation: 'jest setup',
      problem: 'jest issue',
      goal: 'fix jest',
      labels: ['jest'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifact = createMockArtifact({
      id: 'artifact_jest',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Jest Artifact',
      labels: ['jest'],
      capsules: [capsule],
    });

    const intent = makeIntent('jest');

    const graphDocs = [makeGraphDoc('artifact_jest', ['jest'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall([artifact], intent, governanceFilters, 10);

    expect(result).toHaveLength(1);
    expect(result[0]!.capsuleId).toBe('caps_jest');
  });

  it('should return empty array for empty graph documents', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_empty',
      artifactId: 'artifact_empty',
      situation: 'Configuring eslint',
      problem: 'eslint rules',
      goal: 'Fix linting',
      labels: ['eslint'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent = makeIntent('eslint');

    const repo = createMockGraphIndexRepository([]);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    expect(result).toEqual([]);
  });

  it('should return empty array when no graph entities match query', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_no_match',
      artifactId: 'artifact_no_match',
      situation: 'Some situation',
      problem: 'Some problem',
      goal: 'Some goal',
      labels: ['python'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent = makeIntent('something completely unrelated xyzzy');

    const graphDocs = [makeGraphDoc('artifact_no_match', ['python'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    expect(result).toEqual([]);
  });

  it('should return empty array for empty query', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_any',
      artifactId: 'artifact_any',
      situation: 'Something',
      problem: 'Something',
      goal: 'Something',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent: ParsedIntent = {
      seed: '',
      normalized: '',
      situation: null,
      problem: null,
      goal: null,
      errorText: null,
      tokens: [],
      stackPathHints: [],
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };

    const graphDocs = [makeGraphDoc('artifact_any', ['docker'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    expect(result).toEqual([]);
  });

  it('should return empty array for empty artifacts', async () => {
    const intent = makeIntent('docker');
    const graphDocs = [makeGraphDoc('artifact_1', ['docker'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall([], intent, governanceFilters, 10);

    expect(result).toEqual([]);
  });

  it('should respect maxResults', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_a',
        artifactId: 'artifact_a',
        situation: 'Testing a',
        problem: 'test a',
        goal: 'fix a',
        labels: ['vitest'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_b',
        artifactId: 'artifact_b',
        situation: 'Testing b',
        problem: 'test b',
        goal: 'fix b',
        labels: ['vitest'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('vitest');

    const graphDocs = [
      makeGraphDoc('artifact_a', ['vitest']),
      makeGraphDoc('artifact_b', ['vitest']),
    ];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 1);

    expect(result.length).toBeLessThanOrEqual(1);
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
    const graphDocs = [
      makeGraphDoc('artifact_approved', ['docker']),
      makeGraphDoc('artifact_rejected', ['docker']),
    ];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(
      [approvedArtifact, rejectedArtifact],
      intent,
      governanceFilters,
      10,
    );

    const capsuleIds = result.map((c) => c.capsuleId);
    expect(capsuleIds).toContain('caps_approved');
    expect(capsuleIds).not.toContain('caps_rejected');
  });

  it('should not return candidates when graph hits do not intersect governed artifacts', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_independent',
      artifactId: 'artifact_independent',
      situation: 'Working on something',
      problem: 'something',
      goal: 'fix something',
      labels: ['other'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent = makeIntent('docker');

    // Graph only knows about a different artifact
    const graphDocs = [makeGraphDoc('artifact_graph_only', ['docker'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    // Should return empty because graph hit 'artifact_graph_only' does not
    // intersect with governed artifacts (only 'artifact_independent')
    expect(result).toEqual([]);
  });

  it('should return candidates sorted by descending score', async () => {
    const capsule1 = createMockCapsule({
      capsuleId: 'caps_1',
      artifactId: 'artifact_1',
      situation: 'Docker setup',
      problem: 'docker config',
      goal: 'fix docker',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const capsule2 = createMockCapsule({
      capsuleId: 'caps_2',
      artifactId: 'artifact_2',
      situation: 'Docker setup',
      problem: 'docker config',
      goal: 'fix docker',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule1, capsule2]);
    const intent = makeIntent('docker');

    const graphDocs = [
      makeGraphDoc('artifact_1', ['docker']),
      makeGraphDoc('artifact_2', ['docker']),
    ];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    if (result.length >= 2) {
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    }
  });

  it('should return CapsuleRecallCandidate shape', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_shape',
      artifactId: 'artifact_shape',
      situation: 'Testing graphs',
      problem: 'graph issue',
      goal: 'fix graph',
      labels: ['graphql', 'testing'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    const intent = makeIntent('graphql');

    const graphDocs = [makeGraphDoc('artifact_shape', ['graphql', 'testing'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 5);

    for (const c of result) {
      expect(c).toHaveProperty('capsuleId');
      expect(c).toHaveProperty('artifactId');
      expect(c).toHaveProperty('revision');
      expect(c).toHaveProperty('channel');
      expect(c).toHaveProperty('score');
      expect(c).toHaveProperty('graphEvidence');
      expect(typeof c.capsuleId).toBe('string');
      expect(typeof c.artifactId).toBe('string');
      expect(typeof c.channel).toBe('string');
      expect(typeof c.score).toBe('number');
      expect(c.score).toBeGreaterThan(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });

  it('should not return candidates when query has no extractable entities', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_noent',
      artifactId: 'artifact_noent',
      situation: 'This is about docker',
      problem: 'docker issue',
      goal: 'fix docker',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifacts = makeArtifacts([capsule]);
    // Short words that are noise-words will produce empty entities
    const intent = makeIntent('a the an');

    const graphDocs = [makeGraphDoc('artifact_noent', ['docker'])];
    const repo = createMockGraphIndexRepository(graphDocs);
    const channel = createCapsuleGraphChannel(repo);

    const result = await channel.recall(artifacts, intent, governanceFilters, 10);

    // 'a', 'the', 'an' are all noise words and should produce no entities
    expect(result).toEqual([]);
  });

  it('should filter out trap-sourced graph documents', async () => {
    const capsule = createMockCapsule({
      capsuleId: 'caps_skill',
      artifactId: 'artifact_skill',
      situation: 'docker setup',
      problem: 'docker config error',
      goal: 'fix docker',
      labels: ['docker'],
      scope: 'global',
      requiredLevel: 0,
    });

    const artifact = createMockArtifact({
      id: 'artifact_skill',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Docker Artifact',
      labels: ['docker'],
      capsules: [capsule],
    });

    const intent = makeIntent('docker');

    const skillDoc = makeGraphDoc('artifact_skill', ['docker']);
    const trapDoc = makeGraphDoc('artifact_other', ['docker']);
    trapDoc.sourceType = 'trap';

    const repo = createMockGraphIndexRepository([skillDoc, trapDoc]);
    const channel = createCapsuleGraphChannel(repo);
    const result = await channel.recall([artifact], intent, governanceFilters, 10);

    expect(result).toHaveLength(1);
    expect(result[0]!.capsuleId).toBe('caps_skill');
  });
});
