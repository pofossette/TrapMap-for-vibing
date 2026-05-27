import {
  buildCapsuleEmbeddingText,
  capsuleSemanticChannel,
  capsuleSemanticRecall,
  hashCapsuleEmbeddingText,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import type {
  ArtifactGovernanceFilters,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { describe, expect, it, vi } from 'vitest';
import { createMockArtifact, createMockCapsule } from './test-helpers.js';

vi.mock('../../../lib/embeddings.js', () => {
  let callCount = 0;
  const vectors = new Map<string, number[]>();

  function makeVector(seed: string): number[] {
    const v = new Array(384).fill(0);
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    // Deterministic vector: each char influences 4 dimensions
    for (let i = 0; i < seed.length; i++) {
      const c = seed.charCodeAt(i);
      v[c % 384] += 1.0;
      v[(c * 7) % 384] += 0.5;
      v[(c * 13) % 384] -= 0.3;
      v[(c * 17 + i) % 384] += 0.2;
    }
    // Normalize to unit length
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (mag > 0) {
      for (let i = 0; i < v.length; i++) v[i] /= mag;
    }
    return v;
  }

  return {
    generateEmbedding: vi.fn(async (text: string) => {
      callCount++;
      const key = text.toLowerCase().trim();
      let vector = vectors.get(key);
      if (!vector) {
        vector = makeVector(key);
        vectors.set(key, vector);
      }
      return [...vector];
    }),
    generateEmbeddingWithMeta: vi.fn(async (text: string) => {
      const vector = makeVector(text.toLowerCase().trim());
      return { vector: [...vector], latencyMs: 1, provider: 'mock', cached: false };
    }),
    getEmbeddingsAdapter: vi.fn(async () => ({
      provider: 'mock',
      isConfigured: true,
      embed: async (text: string) => [...makeVector(text.toLowerCase().trim())],
    })),
    hashEmbeddingText: vi.fn((text: string) => {
      const { createHash } = require('node:crypto');
      return createHash('sha256').update(text).digest('hex');
    }),
    setGlobalEmbeddingsProvider: vi.fn(),
    FallbackEmbeddings: class {},
    OpenAIEmbeddings: class {},
    _callCount: 0,
    _getCallCount: () => callCount,
  };
});

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

describe('buildCapsuleEmbeddingText', () => {
  it('should include labels, situation, problem, goal, content', () => {
    const text = buildCapsuleEmbeddingText({
      labels: ['docker', 'compose'],
      situation: 'Deploying containers',
      problem: 'Container fails',
      goal: 'Fix deployment',
      content: 'Use docker compose up',
    });

    expect(text).toContain('docker compose');
    expect(text).toContain('Deploying containers');
    expect(text).toContain('Container fails');
    expect(text).toContain('Fix deployment');
    expect(text).toContain('Use docker compose up');
  });

  it('should include contextualPrefix when present', () => {
    const text = buildCapsuleEmbeddingText({
      labels: [],
      situation: 's',
      problem: 'p',
      goal: 'g',
      contextualPrefix: 'This is context about the deployment',
      content: 'main content',
    });

    expect(text).toContain('This is context about the deployment');
  });

  it('should truncate content to MAX_CONTENT_CHARS (500)', () => {
    const longContent = 'x'.repeat(1000);
    const text = buildCapsuleEmbeddingText({
      labels: ['test'],
      situation: 's',
      problem: 'p',
      goal: 'g',
      content: longContent,
    });

    const contentPart = text.split('\n').pop()!;
    expect(contentPart.length).toBeLessThanOrEqual(500);
  });

  it('should omit empty fields', () => {
    const text = buildCapsuleEmbeddingText({
      labels: [],
      situation: '',
      problem: 'only problem',
      goal: '',
      content: '',
    });

    expect(text).toBe('only problem');
  });
});

describe('hashCapsuleEmbeddingText', () => {
  it('should produce consistent hash for same input', () => {
    const text = 'labels: docker\nsituation: deploying';
    const hash1 = hashCapsuleEmbeddingText(text);
    const hash2 = hashCapsuleEmbeddingText(text);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different input', () => {
    const hash1 = hashCapsuleEmbeddingText('text one');
    const hash2 = hashCapsuleEmbeddingText('text two');
    expect(hash1).not.toBe(hash2);
  });
});

describe('capsuleSemanticChannel', () => {
  it('should implement CapsuleRecallChannel interface', () => {
    expect(capsuleSemanticChannel.name).toBe('capsule-semantic');
    expect(typeof capsuleSemanticChannel.recall).toBe('function');
  });
});

describe('capsuleSemanticRecall', () => {
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

  it('should return capsule candidates with semantic scores', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_1',
        artifactId: 'artifact_1',
        situation: 'When deploying containers with docker compose',
        problem: 'Container orchestration configuration issues',
        goal: 'Successfully run multi-container apps',
        labels: ['docker', 'compose'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('docker multi container deployment setup');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_1');
    expect(result[0]!.channel).toBe('capsule-semantic');
    expect(result[0]!.score).toBeGreaterThan(0);
    expect(result[0]!.score).toBeLessThanOrEqual(1);
  });

  it('should give higher score to semantically similar capsules', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_docker',
        artifactId: 'artifact_docker',
        situation: 'Working with docker containers and compose orchestration',
        problem: 'Multi-container deployment issues with docker compose',
        goal: 'Set up reliable container orchestration',
        labels: ['docker', 'compose', 'containers'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_unrelated',
        artifactId: 'artifact_unrelated',
        situation: 'Writing Python scripts',
        problem: 'Type checking issues with mypy',
        goal: 'Add type hints',
        labels: ['python', 'mypy'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('docker compose container deployment orchestration');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    // docker capsule should score higher than unrelated
    expect(result.length).toBeGreaterThanOrEqual(2);
    const dockerResult = result.find((c) => c.capsuleId === 'caps_docker');
    const unrelatedResult = result.find((c) => c.capsuleId === 'caps_unrelated');
    if (dockerResult && unrelatedResult) {
      expect(dockerResult.score).toBeGreaterThan(unrelatedResult.score);
    }
  });

  it('should respect maxResults', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_a',
        artifactId: 'artifact_a',
        situation: 'Docker deployment',
        problem: 'docker fails',
        goal: 'fix docker',
        labels: ['docker'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_b',
        artifactId: 'artifact_b',
        situation: 'Docker build',
        problem: 'build fails',
        goal: 'fix build',
        labels: ['docker', 'build'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('docker');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 1);

    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('should return empty array for empty artifacts', async () => {
    const intent = makeIntent('docker');
    const result = await capsuleSemanticRecall([], intent, governanceFilters, 10);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty query', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_e',
        artifactId: 'artifact_e',
        situation: 'Testing',
        problem: 'test',
        goal: 'pass',
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
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);
    expect(result).toEqual([]);
  });

  it('should handle paraphrase / reworded queries', async () => {
    // Query uses informal language ("figure out", "broken"), capsule uses technical terms
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_obs',
        artifactId: 'artifact_obs',
        situation: 'Running production services',
        problem: 'Observability gap: unable to monitor service health',
        goal: 'Set up monitoring and logging infrastructure',
        labels: ['observability', 'monitoring', 'logging'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_other',
        artifactId: 'artifact_other',
        situation: 'Writing code',
        problem: 'Style linting errors',
        goal: 'Fix lint',
        labels: ['lint', 'style'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    // Paraphrase: "figure out why service is broken" ≈ "observability / monitoring"
    const intent = makeIntent('how do I figure out why my service is broken');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.capsuleId).toBe('caps_obs');
  });

  it('should filter capsules by governance', async () => {
    const approvedCapsule = createMockCapsule({
      capsuleId: 'caps_approved',
      artifactId: 'artifact_approved',
      situation: 'Docker deployment',
      problem: 'docker fails',
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
          situation: 'Docker deployment',
          problem: 'docker fails',
          goal: 'fix docker',
          labels: ['docker'],
          scope: 'global',
          requiredLevel: 0,
        }),
      ],
    });

    const intent = makeIntent('docker deployment');

    const result = await capsuleSemanticRecall(
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
    const intent = makeIntent('web service');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 5);

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

  it('should sort results by descending score', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_low',
        artifactId: 'artifact_low',
        situation: 'Python scripting',
        problem: 'script issue',
        goal: 'fix script',
        labels: ['python'],
        scope: 'global',
        requiredLevel: 0,
      }),
      createMockCapsule({
        capsuleId: 'caps_high',
        artifactId: 'artifact_high',
        situation: 'Docker containers',
        problem: 'Docker compose multi-container deployment issues',
        goal: 'Stabilize docker compose deployment',
        labels: ['docker', 'compose', 'containers', 'deployment'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent = makeIntent('docker compose container deployment');

    const result = await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    if (result.length >= 2) {
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    }
  });

  it('should use semanticQuery when available for embedding text', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_sq',
        artifactId: 'artifact_sq',
        situation: 'deploying',
        problem: 'something broke',
        goal: 'fix deployment',
        labels: ['deployment'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent: ParsedIntent = {
      seed: 'something broke in deployment',
      normalized: 'something broke in deployment',
      situation: null,
      problem: null,
      goal: null,
      errorText: null,
      tokens: [],
      stackPathHints: [],
      category: null,
      semanticQuery: 'kubernetes pod crashloopbackoff debugging',
      parseMethod: 'llm',
    };

    const spy = vi.spyOn(await import('@trapmap/server/lib/embeddings.js'), 'generateEmbedding');

    await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('kubernetes pod crashloopbackoff'));

    spy.mockRestore();
  });

  it('should fall back to seed when semanticQuery is null', async () => {
    const capsules = [
      createMockCapsule({
        capsuleId: 'caps_fb',
        artifactId: 'artifact_fb',
        situation: 'deploying',
        problem: 'container fail',
        goal: 'fix container',
        labels: ['container'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ];

    const artifacts = makeArtifacts(capsules);
    const intent: ParsedIntent = {
      seed: 'container fails to deploy',
      normalized: 'container fails to deploy',
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

    const spy = vi.spyOn(await import('@trapmap/server/lib/embeddings.js'), 'generateEmbedding');

    await capsuleSemanticRecall(artifacts, intent, governanceFilters, 10);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('container'));

    spy.mockRestore();
  });
});
