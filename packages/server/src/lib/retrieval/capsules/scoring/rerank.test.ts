import { beforeEach, describe, expect, it } from 'vitest';

import type {
  ArtifactGovernanceFilters,
  MergedCapsuleCandidate,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { DerivedSkillCapsuleRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { rerankMergedCapsules } from './rerank.js';

describe('rerankMergedCapsules (Phase 2: multi-channel evidence blend)', () => {
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  function makeFilters(
    overrides: {
      teamId?: string | null;
      securityLevel?: number;
      isSystemAdmin?: boolean;
      scopes?: Array<'global' | 'project'>;
      labels?: string[];
    } = {},
  ): ArtifactGovernanceFilters {
    return {
      teamId: overrides.teamId ?? teamId,
      securityLevel: overrides.securityLevel ?? 5,
      isSystemAdmin: overrides.isSystemAdmin ?? false,
      scopes: overrides.scopes ?? [],
      labels: overrides.labels ?? [],
    };
  }

  function createMockArtifact(overrides: {
    id: string;
    teamId: string | null;
    scope: 'global' | 'project';
    lifecycleState: 'approved' | 'submitted' | 'agent-pass' | 'rejected';
    requiredLevel: number;
    title: string;
    labels: string[];
    capsules: DerivedSkillCapsuleRecord[];
  }): SkillArtifactRecord {
    return {
      id: overrides.id,
      teamId: overrides.teamId,
      scope: overrides.scope,
      labels: overrides.labels,
      title: overrides.title,
      slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
      requiredLevel: overrides.requiredLevel,
      lifecycleState: overrides.lifecycleState,
      ownerUserId: userId,
      latestRevision: {
        revision: 1,
        sourceHash: 'a'.repeat(64),
        files: [],
        submittedAt: createdAt,
        submittedByUserId: userId,
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: overrides.id,
            revision: 1,
            sourceHash: 'a'.repeat(64),
            title: overrides.title,
            summary: `Summary for ${overrides.title}`,
            keywords: overrides.labels,
            referencePaths: [],
            contentHash: 'b'.repeat(64),
          },
          capsules: overrides.capsules,
          clientManifest: null,
          sourceHash: 'a'.repeat(64),
          derivedAt: createdAt,
        },
      },
      history: [],
      metadata: {
        sourceKind: 'skill-directory',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      boundary: null,
      decayMeta: null,
      evidenceMeta: null,
      maintenanceMeta: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  function createMockCapsule(overrides: {
    capsuleId: string;
    artifactId: string;
    situation: string;
    problem: string;
    goal: string;
    labels: string[];
    scope: 'global' | 'project';
    requiredLevel: number;
    content?: string;
    contextualPrefix?: string;
  }): DerivedSkillCapsuleRecord {
    return {
      capsuleId: overrides.capsuleId,
      artifactId: overrides.artifactId,
      revision: 1,
      sourcePaths: ['SKILL.md'],
      content: overrides.content ?? `Content for ${overrides.problem}`,
      situation: overrides.situation,
      problem: overrides.problem,
      goal: overrides.goal,
      errorText: null,
      contextualPrefix: overrides.contextualPrefix,
      labels: overrides.labels,
      scope: overrides.scope,
      requiredLevel: overrides.requiredLevel,
    };
  }

  let filters: ArtifactGovernanceFilters;

  beforeEach(() => {
    filters = makeFilters();
  });

  describe('paraphrase: semantic evidence drives ranking', () => {
    it('should rank semantic-channel capsule higher than keyword-only when baseScore is similar', () => {
      const semanticCapsule = createMockCapsule({
        capsuleId: 'capsule_semantic_win',
        artifactId: 'artifact_sem',
        situation: 'When deploying microservices',
        problem: 'Service discovery fails intermittently',
        goal: 'Configure reliable service discovery',
        labels: ['microservices', 'discovery'],
        scope: 'global',
        requiredLevel: 0,
      });

      const keywordCapsule = createMockCapsule({
        capsuleId: 'capsule_keyword_win',
        artifactId: 'artifact_kw',
        situation: 'When deploying microservices',
        problem: 'Service discovery fails intermittently',
        goal: 'Configure reliable service discovery',
        labels: ['microservices', 'discovery'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_sem',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Service Discovery Fix',
          labels: ['microservices', 'discovery'],
          capsules: [semanticCapsule],
        }),
        createMockArtifact({
          id: 'artifact_kw',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Service Discovery Fix KW',
          labels: ['microservices', 'discovery'],
          capsules: [keywordCapsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'microservice discovery intermittent failure',
        normalized: 'microservice discovery intermittent failure',
        situation: null,
        problem: 'microservice discovery intermittent failure',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'microservice', original: 'microservice', isTechnical: true },
          { token: 'discovery', original: 'discovery', isTechnical: true },
          { token: 'intermittent', original: 'intermittent', isTechnical: false },
          { token: 'failure', original: 'failure', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: 'microservice discovery intermittent failure',
        parseMethod: 'llm',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_semantic_win',
          artifactId: 'artifact_sem',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-semantic'],
          channelScores: {
            'capsule-heuristic': 0.4,
            'capsule-semantic': 0.85,
          },
          preRerankScore: 0.032,
          finalScore: 0,
          reason: '',
        },
        {
          capsuleId: 'capsule_keyword_win',
          artifactId: 'artifact_kw',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-keyword'],
          channelScores: {
            'capsule-heuristic': 0.4,
            'capsule-keyword': 0.5,
          },
          preRerankScore: 0.028,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(2);
      expect(ranked[0]!.capsuleId).toBe('capsule_semantic_win');
      expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
    });

    it('should surface semantic evidence in reason string', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_sem_reason',
        artifactId: 'artifact_sem_reason',
        situation: 'When deploying microservices',
        problem: 'Service discovery fails',
        goal: 'Fix service discovery',
        labels: ['microservices'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_sem_reason',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Service Discovery',
          labels: ['microservices'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'microservice discovery issue',
        normalized: 'microservice discovery issue',
        situation: null,
        problem: 'microservice discovery issue',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'microservice', original: 'microservice', isTechnical: true },
          { token: 'discovery', original: 'discovery', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: 'microservice discovery issue',
        parseMethod: 'llm',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_sem_reason',
          artifactId: 'artifact_sem_reason',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-semantic'],
          channelScores: {
            'capsule-heuristic': 0.5,
            'capsule-semantic': 0.9,
          },
          preRerankScore: 0.03,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(1);
      expect(ranked[0]!.reason).toContain('semantic evidence');
    });
  });

  describe('mixed-channel: multi-channel consensus ranks higher', () => {
    it('should rank multi-channel capsule above single-channel with similar baseScore', () => {
      const multiChannelCapsule = createMockCapsule({
        capsuleId: 'capsule_multi',
        artifactId: 'artifact_multi',
        situation: 'When building REST APIs',
        problem: 'Authentication token expires too quickly',
        goal: 'Extend JWT token lifetime',
        labels: ['api', 'auth', 'jwt'],
        scope: 'global',
        requiredLevel: 0,
      });

      const singleChannelCapsule = createMockCapsule({
        capsuleId: 'capsule_single',
        artifactId: 'artifact_single',
        situation: 'When building REST APIs',
        problem: 'Authentication token expires too quickly',
        goal: 'Extend JWT token lifetime',
        labels: ['api', 'auth', 'jwt'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_multi',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'JWT Token Config',
          labels: ['api', 'auth', 'jwt'],
          capsules: [multiChannelCapsule],
        }),
        createMockArtifact({
          id: 'artifact_single',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'JWT Token Config Single',
          labels: ['api', 'auth', 'jwt'],
          capsules: [singleChannelCapsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'jwt token expiration api auth',
        normalized: 'jwt token expiration api auth',
        situation: null,
        problem: 'jwt token expiration',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'jwt', original: 'jwt', isTechnical: true },
          { token: 'token', original: 'token', isTechnical: false },
          { token: 'expiration', original: 'expiration', isTechnical: false },
          { token: 'api', original: 'api', isTechnical: true },
          { token: 'auth', original: 'auth', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: 'jwt token expiration api auth',
        parseMethod: 'llm',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_multi',
          artifactId: 'artifact_multi',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-keyword', 'capsule-semantic'],
          channelScores: {
            'capsule-heuristic': 0.6,
            'capsule-keyword': 0.7,
            'capsule-semantic': 0.8,
          },
          preRerankScore: 0.045,
          finalScore: 0,
          reason: '',
        },
        {
          capsuleId: 'capsule_single',
          artifactId: 'artifact_single',
          revision: 1,
          channels: ['capsule-heuristic'],
          channelScores: {
            'capsule-heuristic': 0.6,
          },
          preRerankScore: 0.016,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(2);
      expect(ranked[0]!.capsuleId).toBe('capsule_multi');
      expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
    });

    it('should include channel consensus in reason for multi-channel hits', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_consensus',
        artifactId: 'artifact_consensus',
        situation: 'When building APIs',
        problem: 'Rate limiting issues',
        goal: 'Implement rate limiting',
        labels: ['api', 'rate-limit'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_consensus',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'API Rate Limiting',
          labels: ['api', 'rate-limit'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'api rate limiting',
        normalized: 'api rate limiting',
        situation: null,
        problem: 'api rate limiting',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'api', original: 'api', isTechnical: true },
          { token: 'rate', original: 'rate', isTechnical: false },
          { token: 'limiting', original: 'limiting', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_consensus',
          artifactId: 'artifact_consensus',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-keyword', 'capsule-semantic'],
          channelScores: {
            'capsule-heuristic': 0.5,
            'capsule-keyword': 0.6,
            'capsule-semantic': 0.7,
          },
          preRerankScore: 0.045,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(1);
      expect(ranked[0]!.reason).toContain('3-channel consensus');
    });

    it('should cap channel consensus boost at 0.12 for many channels', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_many_channels',
        artifactId: 'artifact_many',
        situation: 'When deploying',
        problem: 'Deployment fails',
        goal: 'Fix deployment',
        labels: ['deploy'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_many',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Deployment Fix',
          labels: ['deploy'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'deployment failure',
        normalized: 'deployment failure',
        situation: null,
        problem: 'deployment failure',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'deployment', original: 'deployment', isTechnical: false },
          { token: 'failure', original: 'failure', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_many_channels',
          artifactId: 'artifact_many',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-keyword', 'capsule-semantic', 'capsule-graph'],
          channelScores: {
            'capsule-heuristic': 0.5,
            'capsule-keyword': 0.6,
            'capsule-semantic': 0.7,
            'capsule-graph': 0.85,
          },
          preRerankScore: 0.06,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(1);
      expect(ranked[0]!.finalScore).toBeLessThanOrEqual(1);
      expect(ranked[0]!.reason).toContain('4-channel consensus');
    });
  });

  describe('graph-assisted: graph evidence contributes to ranking', () => {
    it('should boost capsule with graph channel evidence', () => {
      const graphCapsule = createMockCapsule({
        capsuleId: 'capsule_graph',
        artifactId: 'artifact_graph',
        situation: 'When using Docker',
        problem: 'Container memory limits',
        goal: 'Configure Docker memory limits',
        labels: ['docker', 'memory'],
        scope: 'global',
        requiredLevel: 0,
      });

      const noGraphCapsule = createMockCapsule({
        capsuleId: 'capsule_no_graph',
        artifactId: 'artifact_no_graph',
        situation: 'When using Docker',
        problem: 'Container memory limits',
        goal: 'Configure Docker memory limits',
        labels: ['docker', 'memory'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_graph',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Docker Memory Config',
          labels: ['docker', 'memory'],
          capsules: [graphCapsule],
        }),
        createMockArtifact({
          id: 'artifact_no_graph',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Docker Memory Config No Graph',
          labels: ['docker', 'memory'],
          capsules: [noGraphCapsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'docker container memory limit configuration',
        normalized: 'docker container memory limit configuration',
        situation: null,
        problem: 'docker container memory limit',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'container', original: 'container', isTechnical: true },
          { token: 'memory', original: 'memory', isTechnical: false },
          { token: 'limit', original: 'limit', isTechnical: false },
          { token: 'configuration', original: 'configuration', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_graph',
          artifactId: 'artifact_graph',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-graph'],
          channelScores: {
            'capsule-heuristic': 0.5,
            'capsule-graph': 0.85,
          },
          preRerankScore: 0.032,
          finalScore: 0,
          reason: '',
        },
        {
          capsuleId: 'capsule_no_graph',
          artifactId: 'artifact_no_graph',
          revision: 1,
          channels: ['capsule-heuristic'],
          channelScores: {
            'capsule-heuristic': 0.5,
          },
          preRerankScore: 0.016,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(2);
      expect(ranked[0]!.capsuleId).toBe('capsule_graph');
      expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore);
    });

    it('should surface graph evidence in reason string', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_graph_reason',
        artifactId: 'artifact_graph_reason',
        situation: 'When using Docker',
        problem: 'Container OOM kills',
        goal: 'Prevent OOM kills',
        labels: ['docker', 'oom'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_graph_reason',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Docker OOM Prevention',
          labels: ['docker', 'oom'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'docker oom kill prevention',
        normalized: 'docker oom kill prevention',
        situation: null,
        problem: 'docker oom kill',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'oom', original: 'oom', isTechnical: true },
          { token: 'kill', original: 'kill', isTechnical: false },
          { token: 'prevention', original: 'prevention', isTechnical: false },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_graph_reason',
          artifactId: 'artifact_graph_reason',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-graph'],
          channelScores: {
            'capsule-heuristic': 0.6,
            'capsule-graph': 0.9,
          },
          preRerankScore: 0.032,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(1);
      expect(ranked[0]!.reason).toContain('graph evidence');
    });

    it('should combine graph + semantic + consensus boosts for full-channel capsule', () => {
      const fullChannelCapsule = createMockCapsule({
        capsuleId: 'capsule_full',
        artifactId: 'artifact_full',
        situation: 'When deploying Kubernetes',
        problem: 'Pod crash loop backoff',
        goal: 'Fix crash loop',
        labels: ['kubernetes', 'pods'],
        scope: 'global',
        requiredLevel: 0,
      });

      const heuristicOnlyCapsule = createMockCapsule({
        capsuleId: 'capsule_heuristic_only',
        artifactId: 'artifact_heuristic_only',
        situation: 'When deploying Kubernetes',
        problem: 'Pod crash loop backoff',
        goal: 'Fix crash loop',
        labels: ['kubernetes', 'pods'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_full',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'K8s Crash Loop Fix',
          labels: ['kubernetes', 'pods'],
          capsules: [fullChannelCapsule],
        }),
        createMockArtifact({
          id: 'artifact_heuristic_only',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'K8s Crash Loop Fix Heuristic',
          labels: ['kubernetes', 'pods'],
          capsules: [heuristicOnlyCapsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'kubernetes pod crash loop backoff fix',
        normalized: 'kubernetes pod crash loop backoff fix',
        situation: null,
        problem: 'kubernetes pod crash loop backoff',
        goal: 'fix crash loop',
        errorText: null,
        tokens: [
          { token: 'kubernetes', original: 'kubernetes', isTechnical: true },
          { token: 'pod', original: 'pod', isTechnical: true },
          { token: 'crash', original: 'crash', isTechnical: false },
          { token: 'loop', original: 'loop', isTechnical: false },
          { token: 'backoff', original: 'backoff', isTechnical: true },
        ],
        stackPathHints: [],
        category: null,
        semanticQuery: 'kubernetes pod crash loop backoff fix',
        parseMethod: 'llm',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_full',
          artifactId: 'artifact_full',
          revision: 1,
          channels: ['capsule-heuristic', 'capsule-keyword', 'capsule-semantic', 'capsule-graph'],
          channelScores: {
            'capsule-heuristic': 0.6,
            'capsule-keyword': 0.7,
            'capsule-semantic': 0.85,
            'capsule-graph': 0.9,
          },
          preRerankScore: 0.06,
          finalScore: 0,
          reason: '',
        },
        {
          capsuleId: 'capsule_heuristic_only',
          artifactId: 'artifact_heuristic_only',
          revision: 1,
          channels: ['capsule-heuristic'],
          channelScores: {
            'capsule-heuristic': 0.6,
          },
          preRerankScore: 0.016,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(2);
      expect(ranked[0]!.capsuleId).toBe('capsule_full');
      expect(ranked[0]!.reason).toContain('semantic evidence');
      expect(ranked[0]!.reason).toContain('graph evidence');
      expect(ranked[0]!.reason).toContain('4-channel consensus');
    });
  });

  describe('backward compatibility', () => {
    it('should still filter by MIN_CAPSULE_SCORE threshold', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_low',
        artifactId: 'artifact_low',
        situation: 'When doing something',
        problem: 'Unrelated problem',
        goal: 'Unrelated goal',
        labels: ['unrelated'],
        scope: 'global',
        requiredLevel: 0,
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_low',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Unrelated Artifact',
          labels: ['unrelated'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'xyzzy completely unrelated gibberish query',
        normalized: 'xyzzy completely unrelated gibberish query',
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

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_low',
          artifactId: 'artifact_low',
          revision: 1,
          channels: ['capsule-heuristic'],
          channelScores: { 'capsule-heuristic': 0.01 },
          preRerankScore: 0.016,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(0);
    });

    it('should preserve stackPathBoost behavior', () => {
      const capsule = createMockCapsule({
        capsuleId: 'capsule_stack',
        artifactId: 'artifact_stack',
        situation: 'When using Docker and Node.js',
        problem: 'Docker Node version mismatch',
        goal: 'Pin Node version in Dockerfile',
        labels: ['docker', 'node'],
        scope: 'global',
        requiredLevel: 0,
        content: 'Docker Node.js version mismatch container deployment',
      });

      const artifacts = [
        createMockArtifact({
          id: 'artifact_stack',
          teamId: null,
          scope: 'global',
          lifecycleState: 'approved',
          requiredLevel: 0,
          title: 'Docker Node Version',
          labels: ['docker', 'node'],
          capsules: [capsule],
        }),
      ];

      const intent: ParsedIntent = {
        seed: 'docker node version mismatch',
        normalized: 'docker node version mismatch',
        situation: null,
        problem: 'docker node version mismatch',
        goal: null,
        errorText: null,
        tokens: [
          { token: 'docker', original: 'docker', isTechnical: true },
          { token: 'node', original: 'node', isTechnical: true },
          { token: 'version', original: 'version', isTechnical: false },
          { token: 'mismatch', original: 'mismatch', isTechnical: false },
        ],
        stackPathHints: [
          { hint: 'docker', kind: 'stack', confidence: 0.9 },
          { hint: 'node', kind: 'stack', confidence: 0.9 },
        ],
        category: null,
        semanticQuery: null,
        parseMethod: 'regex',
      };

      const merged: MergedCapsuleCandidate[] = [
        {
          capsuleId: 'capsule_stack',
          artifactId: 'artifact_stack',
          revision: 1,
          channels: ['capsule-heuristic'],
          channelScores: { 'capsule-heuristic': 0.7 },
          preRerankScore: 0.016,
          finalScore: 0,
          reason: '',
        },
      ];

      const ranked = rerankMergedCapsules(merged, artifacts, intent, 10, filters);

      expect(ranked.length).toBe(1);
      expect(ranked[0]!.stackPathBoost).toBeGreaterThan(1.0);
    });
  });
});
