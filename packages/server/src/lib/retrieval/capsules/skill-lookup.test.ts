/**
 * Tests for skill-lookup helper (Phase 18 SKED-01).
 * Covers governance filtering, capsule ranking, and artifact dedupe.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { searchSkillsByContent } from './skill-lookup.js';

// Test fixtures
const createTestArtifact = (
  id: string,
  overrides: Partial<SkillArtifactRecord> = {},
): SkillArtifactRecord => ({
  id,
  slug: `artifact-${id}`,
  labels: ['test'],
  scope: 'global',
  requiredLevel: 0,
  teamId: null,
  lifecycleState: 'approved',
  ownerUserId: 'user1',
  latestRevision: {
    revision: 1,
    sourceHash: 'test-hash',
    submittedAt: nowIso(),
    submittedByUserId: 'user1',
    files: [],
    scriptDescriptors: [],
    derived: {
      profile: {
        artifactId: id,
        revision: 1,
        sourceHash: 'test-hash',
        title: `Test Artifact ${id}`,
        summary: 'Test summary',
        keywords: ['test'],
        referencePaths: [],
        contentHash: 'content-hash',
      },
      capsules: [
        {
          capsuleId: `capsule-${id}-1`,
          artifactId: id,
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: `Content for artifact ${id}`,
          situation: 'Test situation',
          problem: 'Test problem',
          goal: 'Test goal',
          labels: ['test'],
          errorText: null,
          scope: 'global',
          requiredLevel: 0,
        },
      ],
      clientManifest: null,
      sourceHash: 'test-hash',
      derivedAt: nowIso(),
    },
  },
  history: [],
  metadata: {
    sourceKind: 'single-skill-md',
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: null,
    latestSubmittedAt: null,
    latestReviewedAt: null,
    latestDecision: null,
  },
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [],
  agentReview: null,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  ...overrides,
});

describe('skill-lookup helper', () => {
  let mockStore: {
    snapshot: () => Promise<{ skillArtifacts: SkillArtifactRecord[] }>;
  };
  let mockServices: { store: typeof mockStore; config: Record<string, unknown> };
  let authContext: ResolvedAuthContext;

  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
    authContext = {
      userId: 'user1',
      activeTeamId: 'team1',
      securityLevel: 5,
      subjectType: 'user',
      effectivePermissions: ['knowledge:search'],
    };

    mockStore = {
      snapshot: async () => ({ skillArtifacts: [] }),
    };

    mockServices = {
      store: mockStore,
      config: {},
      repos: {
        knowledge: {
          listByFilter: async () => [],
        },
        artifact: {
          listByFilter: async () => [],
        },
      },
      ai: {
        embeddings: {
          provider: 'fallback',
          isConfigured: false,
          embed: async () => new Array(384).fill(0),
        },
        chat: {
          provider: 'fallback',
          isConfigured: false,
          invoke: async () => '',
        },
      },
    } as any;
  });

  describe('governance filtering', () => {
    it('excludes artifacts from another team', async () => {
      const artifacts = [
        createTestArtifact('artifact-1', {
          teamId: 'team1', // Same team as auth
          labels: ['docker'],
          latestRevision: {
            ...createTestArtifact('artifact-1').latestRevision,
            derived: {
              profile: {
                title: 'Docker Tips',
                description: '',
                labels: ['docker'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-1',
                  artifactId: 'artifact-1',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Docker container startup tips',
                  situation: 'Starting containers',
                  problem: 'Container fails to start',
                  goal: 'Debug container startup',
                  labels: ['docker'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
        createTestArtifact('artifact-2', {
          teamId: 'team2', // Different team
          labels: ['kubernetes'],
          latestRevision: {
            ...createTestArtifact('artifact-2').latestRevision,
            derived: {
              profile: {
                title: 'K8s Tips',
                description: '',
                labels: ['kubernetes'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-2',
                  artifactId: 'artifact-2',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Kubernetes pod debugging',
                  situation: 'Pod fails',
                  problem: 'Pod stuck in pending',
                  goal: 'Debug pod issues',
                  labels: ['kubernetes'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'container startup',
        maxResults: 10,
      });

      // Only artifact-1 (same team) should appear
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].artifactId).toBe('artifact-1');
    });

    it('excludes artifacts above caller security level', async () => {
      const artifacts = [
        createTestArtifact('artifact-low', {
          requiredLevel: 3, // Below user level 5
          labels: ['public'],
          latestRevision: {
            ...createTestArtifact('artifact-low').latestRevision,
            derived: {
              profile: {
                title: 'Public Tips',
                description: '',
                labels: ['public'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-low',
                  artifactId: 'artifact-low',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Public knowledge',
                  situation: 'General',
                  problem: 'Common issue',
                  goal: 'Solution',
                  labels: ['public'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
        createTestArtifact('artifact-high', {
          requiredLevel: 8, // Above user level 5
          labels: ['secret'],
          latestRevision: {
            ...createTestArtifact('artifact-high').latestRevision,
            derived: {
              profile: {
                title: 'Secret Tips',
                description: '',
                labels: ['secret'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-high',
                  artifactId: 'artifact-high',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Secret knowledge',
                  situation: 'Confidential',
                  problem: 'Sensitive issue',
                  goal: 'Secure solution',
                  labels: ['secret'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'knowledge tips',
        maxResults: 10,
      });

      // Only artifact-low should appear
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].artifactId).toBe('artifact-low');
    });

    it('system admin sees all eligible records regardless of team/level', async () => {
      const adminAuth: ResolvedAuthContext = {
        ...authContext,
        subjectType: 'system-admin',
      };

      const artifacts = [
        createTestArtifact('artifact-1', {
          teamId: 'team2', // Different team
          requiredLevel: 3,
          labels: ['admin-test'],
          latestRevision: {
            ...createTestArtifact('artifact-1').latestRevision,
            derived: {
              profile: {
                title: 'Admin Test',
                description: '',
                labels: ['admin-test'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-1',
                  artifactId: 'artifact-1',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Admin content',
                  situation: 'Admin situation',
                  problem: 'Admin problem',
                  goal: 'Admin goal',
                  labels: ['admin-test'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
        createTestArtifact('artifact-2', {
          teamId: null,
          requiredLevel: 10, // High level
          labels: ['admin-high'],
          latestRevision: {
            ...createTestArtifact('artifact-2').latestRevision,
            derived: {
              profile: {
                title: 'High Level',
                description: '',
                labels: ['admin-high'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-2',
                  artifactId: 'artifact-2',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'High level content',
                  situation: 'High situation',
                  problem: 'High problem',
                  goal: 'High goal',
                  labels: ['admin-high'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, adminAuth, {
        text: 'admin content',
        maxResults: 10,
      });

      // System admin should see all approved artifacts
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('excludes non-approved artifacts', async () => {
      const artifacts = [
        createTestArtifact('artifact-approved', {
          lifecycleState: 'approved',
          labels: ['approved'],
          latestRevision: {
            ...createTestArtifact('artifact-approved').latestRevision,
            derived: {
              profile: {
                title: 'Approved',
                description: '',
                labels: ['approved'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-approved',
                  artifactId: 'artifact-approved',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Approved content',
                  situation: 'Approved situation',
                  problem: 'Approved problem',
                  goal: 'Approved goal',
                  labels: ['approved'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
        createTestArtifact('artifact-pending', {
          lifecycleState: 'pending',
          labels: ['pending'],
          latestRevision: {
            ...createTestArtifact('artifact-pending').latestRevision,
            derived: {
              profile: {
                title: 'Pending',
                description: '',
                labels: ['pending'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-pending',
                  artifactId: 'artifact-pending',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Pending content',
                  situation: 'Pending situation',
                  problem: 'Pending problem',
                  goal: 'Pending goal',
                  labels: ['pending'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'content',
        maxResults: 10,
      });

      // Only approved artifact should appear
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].artifactId).toBe('artifact-approved');
    });
  });

  describe('artifact dedupe', () => {
    it('dedupes multiple capsule matches to one artifact entry', async () => {
      // Create artifact with multiple capsules that all match
      const artifacts = [
        createTestArtifact('artifact-multi', {
          labels: ['multi'],
          latestRevision: {
            ...createTestArtifact('artifact-multi').latestRevision,
            derived: {
              profile: {
                title: 'Multi Capsule',
                description: '',
                labels: ['multi'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-1',
                  artifactId: 'artifact-multi',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Docker container startup debugging',
                  situation: 'Starting containers',
                  problem: 'Container fails to start',
                  goal: 'Debug container startup',
                  labels: ['docker', 'container'],
                  errorText: null,
                },
                {
                  capsuleId: 'capsule-2',
                  artifactId: 'artifact-multi',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Docker container networking issues',
                  situation: 'Container networking',
                  problem: 'Network connectivity fails',
                  goal: 'Debug network issues',
                  labels: ['docker', 'networking'],
                  errorText: null,
                },
                {
                  capsuleId: 'capsule-3',
                  artifactId: 'artifact-multi',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Docker volume mounting problems',
                  situation: 'Volume mounting',
                  problem: 'Volumes not accessible',
                  goal: 'Fix volume issues',
                  labels: ['docker', 'volume'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'docker container',
        maxResults: 10,
      });

      // Should dedupe to one artifact entry
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].artifactId).toBe('artifact-multi');
    });

    it('keeps highest-scoring capsule for deduped artifact', async () => {
      const artifacts = [
        createTestArtifact('artifact-score', {
          labels: ['score'],
          latestRevision: {
            ...createTestArtifact('artifact-score').latestRevision,
            derived: {
              profile: {
                title: 'Score Test',
                description: '',
                labels: ['score'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-high-score',
                  artifactId: 'artifact-score',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Docker container startup exact match problem',
                  situation: 'Starting containers',
                  problem: 'Container fails to start docker container',
                  goal: 'Debug container startup',
                  labels: ['docker', 'exact'],
                  errorText: null,
                },
                {
                  capsuleId: 'capsule-low-score',
                  artifactId: 'artifact-score',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Unrelated content about other things',
                  situation: 'Other situation',
                  problem: 'Different problem',
                  goal: 'Different goal',
                  labels: ['other'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'docker container startup',
        maxResults: 10,
      });

      expect(result.matches).toHaveLength(1);
      // The result should use the highest-scoring capsule's reason
      expect(result.matches[0].score).toBeGreaterThan(0);
    });
  });

  describe('result shaping', () => {
    it('returns artifact-first metadata without capsule content', async () => {
      const artifacts = [
        createTestArtifact('artifact-meta', {
          slug: 'test-artifact-slug',
          scope: 'project',
          requiredLevel: 2,
          labels: ['metadata'],
          teamId: 'team1',
          latestRevision: {
            ...createTestArtifact('artifact-meta').latestRevision,
            derived: {
              profile: {
                title: 'Metadata Test Artifact',
                description: 'Test description',
                labels: ['metadata', 'test'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-meta',
                  artifactId: 'artifact-meta',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'This content should not appear in output',
                  situation: 'Test',
                  problem: 'Test',
                  goal: 'Test',
                  labels: ['metadata'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'metadata test',
        maxResults: 10,
      });

      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];

      // Verify artifact-first fields
      expect(match.artifactId).toBe('artifact-meta');
      expect(match.title).toBe('Metadata Test Artifact');
      expect(match.slug).toBe('test-artifact-slug');
      expect(match.labels).toContain('metadata');
      expect(match.scope).toBe('project');
      expect(match.requiredLevel).toBe(2);
      expect(match.sourceKind).toBeDefined();
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.reason).toBeDefined();

      // Verify capsule content is NOT included
      expect((match as any).content).toBeUndefined();
      expect((match as any).situation).toBeUndefined();
      expect((match as any).problem).toBeUndefined();
    });

    it('respects maxResults limit', async () => {
      const artifacts = [];
      for (let i = 0; i < 20; i++) {
        artifacts.push(
          createTestArtifact(`artifact-${i}`, {
            labels: ['limit-test'],
            latestRevision: {
              ...createTestArtifact(`artifact-${i}`).latestRevision,
              derived: {
                profile: {
                  title: `Artifact ${i}`,
                  description: '',
                  labels: ['limit-test'],
                  prerequisites: [],
                },
                capsules: [
                  {
                    capsuleId: `capsule-${i}`,
                    artifactId: `artifact-${i}`,
                    revision: 1,
                    sourcePaths: ['SKILL.md'],
                    content: `Content ${i}`,
                    situation: 'Test',
                    problem: 'Test',
                    goal: 'Test',
                    labels: ['limit-test'],
                    errorText: null,
                  },
                ],
                clientManifest: null,
              },
            },
          }),
        );
      }

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'limit test',
        maxResults: 5,
      });

      expect(result.matches.length).toBeLessThanOrEqual(5);
    });

    it('returns empty array when no artifacts match', async () => {
      mockStore.snapshot = async () => ({ skillArtifacts: [] });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => [] },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'nonexistent content',
        maxResults: 10,
      });

      expect(result.matches).toEqual([]);
    });

    it('returns empty array when no artifacts pass governance', async () => {
      const artifacts = [
        createTestArtifact('artifact-other-team', {
          teamId: 'other-team',
          labels: ['other'],
          latestRevision: {
            ...createTestArtifact('artifact-other-team').latestRevision,
            derived: {
              profile: {
                title: 'Other Team',
                description: '',
                labels: ['other'],
                prerequisites: [],
              },
              capsules: [
                {
                  capsuleId: 'capsule-other',
                  artifactId: 'artifact-other-team',
                  revision: 1,
                  sourcePaths: ['SKILL.md'],
                  content: 'Other team content',
                  situation: 'Other',
                  problem: 'Other',
                  goal: 'Other',
                  labels: ['other'],
                  errorText: null,
                },
              ],
              clientManifest: null,
            },
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'other team content',
        maxResults: 10,
      });

      expect(result.matches).toEqual([]);
    });
  });

  describe('source kind determination', () => {
    it('classifies legacy-knowledge artifacts', async () => {
      const artifacts = [
        createTestArtifact('artifact-legacy', {
          labels: ['legacy'],
          metadata: {
            sourceKind: 'legacy-knowledge',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: null,
            latestSubmittedAt: null,
            latestReviewedAt: null,
            latestDecision: null,
          },
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'legacy content',
        maxResults: 10,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceKind).toBe('legacy-knowledge');
    });

    it('classifies skill-directory artifacts', async () => {
      const artifacts = [
        createTestArtifact('artifact-directory', {
          labels: ['directory'],
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
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'directory content',
        maxResults: 10,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceKind).toBe('skill-directory');
    });

    it('classifies single-skill-md artifacts by default', async () => {
      const artifacts = [
        createTestArtifact('artifact-single', {
          labels: ['single'],
          // metadata.sourceKind defaults to 'single-skill-md' in createTestArtifact
        }),
      ];

      mockStore.snapshot = async () => ({ skillArtifacts: artifacts });
      mockServices.repos = {
        knowledge: { listByFilter: async () => [] },
        artifact: { listByFilter: async () => artifacts },
      } as any;

      const result = await searchSkillsByContent(mockServices as any, authContext, {
        text: 'single content',
        maxResults: 10,
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceKind).toBe('single-skill-md');
    });
  });
});
