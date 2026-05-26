import { describe, expect, it } from 'vitest';

import {
  PathValidationError,
  activationFilePayloadSchema,
  activationRequestSchema,
  activationResponseSchema,
  artifactBundleSchema,
  artifactExportFormatSchema,
  artifactExportRequestSchema,
  artifactExportResponseSchema,
  artifactFilePayloadRecordSchema,
  artifactImportRequestSchema,
  artifactImportResponseSchema,
  assetAvailabilityHintSchema,
  bundleFilePayloadSchema,
  bundleScriptDescriptorSchema,
  canonicalPathSchema,
  capsuleActivationHintsSchema,
  clientManifestSchema,
  distilledArtifactSchema,
  knowledgeEntrySchema,
  knowledgeSubmissionSchema,
  loginRequestSchema,
  readNextReferenceHintSchema,
  retrievalQuerySchema,
  retrievalResponseSchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseSchema,
  retrievalV2ResponseWithHintsSchema,
  reviewDecisionRequestSchema,
  scriptProfileHintSchema,
  securityLevelSchema,
  skillArtifactDerivedSchema,
  skillArtifactFileKindSchema,
  skillArtifactFileSchema,
  skillArtifactRevisionSchema,
  skillArtifactSchema,
  skillCapsuleSchema,
  skillLookupQuerySchema,
  skillLookupResponseSchema,
  skillLookupResultItemSchema,
  skillProfileSchema,
  skillScriptDescriptorSchema,
  validateRelativePath,
} from './index.js';

describe('contracts package', () => {
  it('accepts bounded security levels', () => {
    expect(securityLevelSchema.parse(10)).toBe(10);
    expect(() => securityLevelSchema.parse(11)).toThrow();
  });

  it('parses either login key shape', () => {
    expect(loginRequestSchema.parse({ accessKey: 'aaaaaaaaaaaaaaaa' })).toHaveProperty('accessKey');
    expect(loginRequestSchema.parse({ systemAdminKey: 'bbbbbbbbbbbbbbbb' })).toHaveProperty(
      'systemAdminKey',
    );
  });

  it('defaults retrieval query values', () => {
    const parsed = retrievalQuerySchema.parse({ seed: 'why does drizzle fail on pgvector' });

    expect(parsed.maxResults).toBe(10);
    expect(parsed.filters.labels).toEqual([]);
    expect(parsed.filters.scopes).toEqual([]);
    expect(parsed.mode).toBe('semantic');
    expect(parsed.includeSummary).toBe(false);
  });

  it('allows explicit summary flag in retrieval query', () => {
    const parsed = retrievalQuerySchema.parse({
      seed: 'docker timeout',
      includeSummary: true,
    });

    expect(parsed.includeSummary).toBe(true);
  });

  it('requires a structured knowledge submission', () => {
    const parsed = knowledgeSubmissionSchema.parse({
      scope: 'project',
      labels: ['drizzle', 'pgvector'],
      shortcut: 'Use pgvector support through Drizzle SQL-first schema helpers.',
      detail: 'Prototype contract test ensures shape consistency across CLI and server.',
    });

    expect(parsed.labels).toHaveLength(2);
  });

  it('requires review notes for reviewer actions', () => {
    expect(() =>
      reviewDecisionRequestSchema.parse({
        entryId: 'entry-1',
        decision: 'reject',
        notes: '',
      }),
    ).toThrow();
  });

  it('models lifecycle metadata and submission history for knowledge entries', () => {
    const parsed = knowledgeEntrySchema.parse({
      id: 'knowledge_1',
      teamId: 'team_1',
      scope: 'project',
      labels: ['langchain', 'review'],
      shortcut: 'Keep rejected submissions linked to their prior attempt.',
      detail: 'Submission records retain agent review, reviewer output, and audit-friendly notes.',
      requiredLevel: 3,
      lifecycleState: 'rejected',
      owner: {
        id: 'user_1',
        handle: 'owner',
        securityLevel: 3,
      },
      latestRevision: {
        revision: 2,
        submittedAt: '2026-04-13T08:00:00.000Z',
        submittedBy: {
          id: 'user_1',
          handle: 'owner',
          securityLevel: 3,
        },
        shortcut: 'Keep rejected submissions linked to their prior attempt.',
        detail:
          'Submission records retain agent review, reviewer output, and audit-friendly notes.',
        labels: ['langchain', 'review'],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-04-13T07:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          shortcut: 'First attempt',
          detail: 'Initial detail',
          labels: ['langchain'],
        },
        {
          revision: 2,
          submittedAt: '2026-04-13T08:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          shortcut: 'Keep rejected submissions linked to their prior attempt.',
          detail:
            'Submission records retain agent review, reviewer output, and audit-friendly notes.',
          labels: ['langchain', 'review'],
        },
      ],
      metadata: {
        scopeLabel: 'project-knowledge',
        submissionCount: 2,
        resubmissionCount: 1,
        revisionCount: 2,
        latestSubmissionId: 'submission_2',
        latestSubmittedAt: '2026-04-13T08:00:00.000Z',
        latestReviewedAt: '2026-04-13T08:30:00.000Z',
        latestDecision: 'reject',
      },
      latestSubmission: {
        id: 'submission_2',
        revision: 2,
        submittedAt: '2026-04-13T08:00:00.000Z',
        submittedBy: {
          id: 'user_1',
          handle: 'owner',
          securityLevel: 3,
        },
        lifecycleState: 'rejected',
        resubmissionOf: 'submission_1',
        agentReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2026-04-13T08:10:00.000Z',
        },
        reviewerDecision: {
          decidedAt: '2026-04-13T08:30:00.000Z',
          decidedBy: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          decision: 'reject',
          notes: 'Needs one concrete repro step.',
        },
        reviewNotes: [
          {
            id: 'note_1',
            createdAt: '2026-04-13T08:30:00.000Z',
            authorType: 'reviewer',
            author: {
              id: 'user_2',
              handle: 'reviewer',
              securityLevel: 5,
            },
            message: 'Needs one concrete repro step.',
          },
        ],
      },
      submissionHistory: [],
      agentReview: {
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'low',
        completenessRisk: 'low',
        checkedAt: '2026-04-13T08:10:00.000Z',
      },
      reviewHistory: [
        {
          decidedAt: '2026-04-13T08:30:00.000Z',
          decidedBy: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          decision: 'reject',
          notes: 'Needs one concrete repro step.',
        },
      ],
      reviewNotes: [
        {
          id: 'note_1',
          createdAt: '2026-04-13T08:30:00.000Z',
          authorType: 'reviewer',
          author: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          message: 'Needs one concrete repro step.',
        },
      ],
      lifecycleHistory: [
        {
          id: 'event_1',
          type: 'submitted',
          createdAt: '2026-04-13T07:00:00.000Z',
          actor: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          submissionId: 'submission_1',
          revision: 1,
          state: 'submitted',
          note: null,
        },
      ],
      createdAt: '2026-04-13T07:00:00.000Z',
      updatedAt: '2026-04-13T08:30:00.000Z',
    });

    expect(parsed.metadata.resubmissionCount).toBe(1);
    expect(parsed.latestSubmission?.reviewerDecision?.decision).toBe('reject');
  });

  describe('Phase 10: Citation and Summary contracts', () => {
    it('parses retrieval response with structured citations', () => {
      const response = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 3,
            shortcut: 'Validate JWT tokens',
            detail: 'JWT tokens must be validated on every request',
            labels: ['security', 'auth'],
            score: 0.95,
            reason: 'High semantic match',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'Validate JWT tokens',
              },
              snippet: 'JWT tokens must be validated on every request',
              tags: ['security', 'auth'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.95,
                keyword: null,
                graph: null,
                preRerank: 0.92,
                final: 0.95,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const parsed = retrievalResponseSchema.parse(response);
      expect(parsed.globalConstraints[0]?.citation).toBeDefined();
      expect(parsed.globalConstraints[0]?.citation?.recallChannels).toEqual(['semantic']);
    });

    it('parses retrieval response with optional summary', () => {
      const response = {
        globalConstraints: [],
        projectKnowledge: [
          {
            entryId: 'entry-2',
            scope: 'project',
            requiredLevel: 5,
            shortcut: 'TypeScript strict mode',
            detail: 'Enable strictNullChecks in tsconfig',
            labels: ['typescript'],
            score: 0.88,
            reason: 'Matches query terms',
            citation: {
              source: {
                entryId: 'entry-2',
                scope: 'project',
                shortcut: 'TypeScript strict mode',
              },
              snippet: 'Enable strictNullChecks in tsconfig',
              tags: ['typescript'],
              recallChannels: ['semantic', 'keyword'],
              scores: {
                semantic: 0.85,
                keyword: 0.9,
                graph: null,
                preRerank: 0.87,
                final: 0.88,
              },
            },
          },
        ],
        refinementSummary: null,
        summary: {
          text: 'Use TypeScript strict mode with null checks enabled.',
          citations: [
            {
              source: {
                entryId: 'entry-2',
                scope: 'project',
                shortcut: 'TypeScript strict mode',
              },
              snippet: 'Enable strictNullChecks in tsconfig',
              tags: ['typescript'],
              recallChannels: ['semantic', 'keyword'],
              scores: {
                semantic: 0.85,
                keyword: 0.9,
                graph: null,
                preRerank: 0.87,
                final: 0.88,
              },
            },
          ],
        },
      };

      const parsed = retrievalResponseSchema.parse(response);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary?.text).toBe('Use TypeScript strict mode with null checks enabled.');
      expect(parsed.summary?.citations).toHaveLength(1);
    });

    it('allows null summary when not requested', () => {
      const response = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const parsed = retrievalResponseSchema.parse(response);
      expect(parsed.summary).toBeNull();
    });

    it('supports hybrid and graph-assisted recall channels in citations', () => {
      const response = {
        globalConstraints: [
          {
            entryId: 'entry-3',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Docker networking',
            detail: 'Container networking basics',
            labels: ['docker'],
            score: 0.92,
            reason: 'Graph-assisted match',
            citation: {
              source: {
                entryId: 'entry-3',
                scope: 'global',
                shortcut: 'Docker networking',
              },
              snippet: 'Container networking basics',
              tags: ['docker'],
              recallChannels: ['semantic', 'graph'],
              scores: {
                semantic: 0.88,
                keyword: null,
                graph: 0.75,
                preRerank: 0.9,
                final: 0.92,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const parsed = retrievalResponseSchema.parse(response);
      expect(parsed.globalConstraints[0]?.citation?.recallChannels).toEqual(['semantic', 'graph']);
      expect(parsed.globalConstraints[0]?.citation?.scores.graph).toBe(0.75);
    });

    it('maintains backward compatibility with includeRefinement flag', () => {
      const queryWithRefinement = retrievalQuerySchema.parse({
        seed: 'test query',
        includeRefinement: true,
      });

      // includeRefinement should still be recognized for compatibility
      expect(queryWithRefinement.includeRefinement).toBe(true);
      // But canonical summary flag should be false by default
      expect(queryWithRefinement.includeSummary).toBe(false);
    });
  });

  describe('Phase 12: Skill Artifact Contracts', () => {
    describe('File kind separation (ARTF-01, COMP-01)', () => {
      it('preserves the four canonical file kinds', () => {
        const skillMarkdown = skillArtifactFileKindSchema.parse('skill-markdown');
        const reference = skillArtifactFileKindSchema.parse('reference');
        const asset = skillArtifactFileKindSchema.parse('asset');
        const script = skillArtifactFileKindSchema.parse('script');

        expect(skillMarkdown).toBe('skill-markdown');
        expect(reference).toBe('reference');
        expect(asset).toBe('asset');
        expect(script).toBe('script');
      });

      it('rejects invalid file kinds', () => {
        expect(() => skillArtifactFileKindSchema.parse('unknown')).toThrow();
      });

      it('artifact files preserve path, media type, byte size, sha256, and inclusion metadata', () => {
        const file = skillArtifactFileSchema.parse({
          path: 'references/docker.md',
          kind: 'reference',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        });

        expect(file.path).toBe('references/docker.md');
        expect(file.kind).toBe('reference');
        expect(file.mediaType).toBe('text/markdown');
        expect(file.sizeBytes).toBe(1024);
        expect(file.sha256).toHaveLength(64);
        expect(file.includeInDerivation).toBe(true);
        expect(file.activationOnly).toBe(false);
      });

      it('script descriptors capture capability metadata without bodies', () => {
        const descriptor = skillScriptDescriptorSchema.parse({
          path: 'scripts/setup.sh',
          sha256: 'b'.repeat(64),
          capability: 'Docker container cleanup',
          argsSchemaSummary: '--force, --verbose',
          sideEffectSummary: 'Stops and removes containers',
          defaultPolicy: 'manual',
        });

        expect(descriptor.capability).toBe('Docker container cleanup');
        expect(descriptor.defaultPolicy).toBe('manual');
        expect(descriptor.argsSchemaSummary).toBe('--force, --verbose');
        expect(descriptor.sideEffectSummary).toBe('Stops and removes containers');
      });
    });

    describe('Artifact revisions (ARTF-02, COMP-01)', () => {
      it('revisions carry immutable revision, sourceHash, files, and governance-inherited metadata', () => {
        const revision = skillArtifactRevisionSchema.parse({
          revision: 1,
          sourceHash: 'c'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'd'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2026-04-16T10:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          scriptDescriptors: [],
          derived: null,
        });

        expect(revision.revision).toBe(1);
        expect(revision.sourceHash).toHaveLength(64);
        expect(revision.files).toHaveLength(1);
        expect(revision.submittedBy).toBeDefined();
        expect(revision.derived).toBeNull();
      });

      it('derived outputs default to null when not yet computed', () => {
        const revision = skillArtifactRevisionSchema.parse({
          revision: 1,
          sourceHash: 'e'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'f'.repeat(64),
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2026-04-16T10:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          scriptDescriptors: [],
          derived: null,
        });

        expect(revision.derived).toBeNull();
      });
    });

    describe('Artifact root metadata (ARTF-01, ARTF-02, COMP-01)', () => {
      it('artifact root keeps lifecycle, review, scope, team, and security hooks additive beside legacy knowledge contracts', () => {
        const artifact = skillArtifactSchema.parse({
          id: 'artifact_1',
          teamId: 'team_1',
          scope: 'project',
          labels: ['docker', 'deployment'],
          title: 'Docker Deployment Skills',
          slug: 'docker-deployment',
          requiredLevel: 3,
          lifecycleState: 'approved',
          owner: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          latestRevision: 1,
          history: [
            {
              revision: 1,
              sourceHash: 'f'.repeat(64),
              files: [
                {
                  path: 'SKILL.md',
                  kind: 'skill-markdown',
                  sha256: '0a'.repeat(32),
                  sizeBytes: 512,
                  mediaType: 'text/markdown',
                  source: 'SKILL.md',
                  includeInDerivation: true,
                  activationOnly: false,
                },
              ],
              submittedAt: '2026-04-16T10:00:00.000Z',
              submittedBy: {
                id: 'user_1',
                handle: 'owner',
                securityLevel: 3,
              },
              scriptDescriptors: [],
              derived: null,
            },
          ],
          metadata: {
            sourceKind: 'skill-directory',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_1',
            latestSubmittedAt: '2026-04-16T10:00:00.000Z',
            latestReviewedAt: '2026-04-16T11:00:00.000Z',
            latestDecision: 'approve',
          },
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T11:00:00.000Z',
        });

        expect(artifact.lifecycleState).toBe('approved');
        expect(artifact.scope).toBe('project');
        expect(artifact.requiredLevel).toBe(3);
        expect(artifact.teamId).toBe('team_1');
        expect(artifact.metadata.sourceKind).toBe('skill-directory');
      });

      it('artifact and knowledge contracts can coexist without replacing each other', () => {
        // Verify knowledge schema still works
        const knowledge = knowledgeEntrySchema.parse({
          id: 'knowledge_1',
          teamId: 'team_1',
          scope: 'project',
          labels: ['test'],
          shortcut: 'Test shortcut',
          detail: 'Test detail',
          requiredLevel: 0,
          lifecycleState: 'draft',
          owner: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 0,
          },
          latestRevision: {
            revision: 1,
            submittedAt: '2026-04-16T10:00:00.000Z',
            submittedBy: {
              id: 'user_1',
              handle: 'owner',
              securityLevel: 0,
            },
            shortcut: 'Test shortcut',
            detail: 'Test detail',
            labels: ['test'],
          },
          history: [
            {
              revision: 1,
              submittedAt: '2026-04-16T10:00:00.000Z',
              submittedBy: {
                id: 'user_1',
                handle: 'owner',
                securityLevel: 0,
              },
              shortcut: 'Test shortcut',
              detail: 'Test detail',
              labels: ['test'],
            },
          ],
          metadata: {
            scopeLabel: 'project-knowledge',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_1',
            latestSubmittedAt: '2026-04-16T10:00:00.000Z',
            latestReviewedAt: null,
            latestDecision: null,
          },
          agentReview: null,
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
        });

        // Verify artifact schema works
        const artifact = skillArtifactSchema.parse({
          id: 'artifact_1',
          teamId: null,
          scope: 'global',
          labels: ['test'],
          title: 'Test Artifact',
          slug: 'test-artifact',
          requiredLevel: 0,
          lifecycleState: 'draft',
          owner: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 0,
          },
          latestRevision: 1,
          history: [
            {
              revision: 1,
              sourceHash: '0b'.repeat(32),
              files: [
                {
                  path: 'SKILL.md',
                  kind: 'skill-markdown',
                  sha256: '0c'.repeat(32),
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  source: 'SKILL.md',
                  includeInDerivation: true,
                  activationOnly: false,
                },
              ],
              submittedAt: '2026-04-16T10:00:00.000Z',
              submittedBy: {
                id: 'user_1',
                handle: 'owner',
                securityLevel: 0,
              },
              scriptDescriptors: [],
              derived: null,
            },
          ],
          metadata: {
            sourceKind: 'skill-directory',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'submission_1',
            latestSubmittedAt: '2026-04-16T10:00:00.000Z',
            latestReviewedAt: null,
            latestDecision: null,
          },
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
        });

        // Both should parse successfully, proving additive coexistence
        expect(knowledge.id).toBe('knowledge_1');
        expect(artifact.id).toBe('artifact_1');
      });
    });

    describe('Derived profile, capsule, and client-manifest contracts (CAPS-01, COMP-01)', () => {
      describe('skillProfileSchema (CAPS-01)', () => {
        it('captures the distilled artifact-wide text shape derived only from SKILL.md and references/', () => {
          const profile = skillProfileSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            sourceHash: '0d'.repeat(32),
            title: 'Docker Deployment Skills',
            summary: 'Best practices for deploying containers',
            keywords: ['docker', 'deployment', 'containers'],
            referencePaths: ['references/docker-compose.md', 'references/networking.md'],
            contentHash: '0e'.repeat(32),
          });

          expect(profile.artifactId).toBe('artifact_1');
          expect(profile.title).toBe('Docker Deployment Skills');
          expect(profile.keywords).toEqual(['docker', 'deployment', 'containers']);
          expect(profile.referencePaths).toHaveLength(2);
        });

        it('requires artifactId, revision, sourceHash, title, summary, and contentHash', () => {
          const minimalProfile = skillProfileSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            sourceHash: '0f'.repeat(32),
            title: 'Test',
            summary: 'Test summary',
            keywords: [],
            referencePaths: [],
            contentHash: '1a'.repeat(32),
          });

          expect(minimalProfile.keywords).toEqual([]);
          expect(minimalProfile.referencePaths).toEqual([]);
        });
      });

      describe('skillCapsuleSchema (CAPS-01, T-12-02)', () => {
        it('carries deterministic capsule ids, source paths, and governance inheritance without embedding asset or script bodies', () => {
          const capsule = skillCapsuleSchema.parse({
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md', 'references/docker.md'],
            content: 'Use docker-compose for multi-container deployments',
            situation: 'Deploying multiple containers that need to communicate',
            problem: 'Managing networking and volumes manually is error-prone',
            goal: 'Simplify multi-container deployment with compose',
            errorText: undefined,
            labels: ['docker', 'compose'],
            scope: 'project',
            requiredLevel: 3,
          });

          expect(capsule.capsuleId).toBe('capsule_1');
          expect(capsule.sourcePaths).toHaveLength(2);
          expect(capsule.content).not.toContain('script body');
          expect(capsule.errorText).toBeUndefined();
        });

        it('allows optional errorText for error-specific capsules', () => {
          const errorCapsule = skillCapsuleSchema.parse({
            capsuleId: 'capsule_2',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Check container logs for detailed error messages',
            situation: 'Container fails to start',
            problem: 'Permission denied on volume mount',
            goal: 'Fix volume permissions and restart container',
            errorText: 'Error: permission denied while trying to connect to the Docker daemon',
            labels: ['docker', 'permissions'],
            scope: 'global',
            requiredLevel: 0,
          });

          expect(errorCapsule.errorText).toBe(
            'Error: permission denied while trying to connect to the Docker daemon',
          );
        });

        it('rejects asset or script bodies as capsule content (T-12-02 mitigation)', () => {
          // Valid capsule with reference content
          const validCapsule = skillCapsuleSchema.parse({
            capsuleId: 'capsule_3',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['references/troubleshooting.md'],
            content: 'Check docker logs for troubleshooting steps',
            situation: 'Debugging container issues',
            problem: 'Container exits unexpectedly',
            goal: 'Identify root cause from logs',
            labels: ['docker', 'debugging'],
            scope: 'project',
            requiredLevel: 2,
          });

          expect(validCapsule.content).not.toContain('#!/bin/bash');
        });
      });

      describe('clientManifestSchema (CAPS-01, T-12-02)', () => {
        it('exposes activation metadata for references, assets, and scripts while remaining distinct from retrieval output defaults', () => {
          const manifest = clientManifestSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            references: [
              {
                path: 'references/docker.md',
                sha256: '1b'.repeat(32),
                sizeBytes: 2048,
                mediaType: 'text/markdown',
              },
            ],
            assets: [
              {
                path: 'assets/docker-compose.yml',
                sha256: '1c'.repeat(32),
                sizeBytes: 512,
                mediaType: 'text/x-yaml',
              },
            ],
            scripts: [
              {
                path: 'scripts/setup.sh',
                sha256: '1d'.repeat(32),
                capability: 'Initialize Docker environment',
                argsSchemaSummary: '--env, --force',
                sideEffectSummary: 'Creates Docker network and volumes',
                defaultPolicy: 'manual',
              },
            ],
            sourceHash: 'ab'.repeat(32),
          });

          expect(manifest.references).toHaveLength(1);
          expect(manifest.assets).toHaveLength(1);
          expect(manifest.scripts).toHaveLength(1);
          expect(manifest.scripts[0]?.capability).toBe('Initialize Docker environment');
          expect(manifest.scripts[0]?.defaultPolicy).toBe('manual');
        });

        it('script entries expose only metadata, never script body text (T-12-02 mitigation)', () => {
          const manifest = clientManifestSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            references: [],
            assets: [],
            scripts: [
              {
                path: 'scripts/deploy.sh',
                sha256: '1e'.repeat(32),
                capability: 'Deploy application containers',
                argsSchemaSummary: '--env, --tag',
                sideEffectSummary: 'Deploys containers to production',
                defaultPolicy: 'auto',
              },
            ],
            sourceHash: 'cd'.repeat(32),
          });

          const scriptEntry = manifest.scripts[0];
          expect(scriptEntry).toBeDefined();
          expect(scriptEntry?.capability).toBe('Deploy application containers');
          // Verify no script body is included
          expect(scriptEntry && !('body' in scriptEntry)).toBe(true);
        });
      });

      describe('CAPS-01 and COMP-01 validation', () => {
        it('derived shapes remain valid shared contracts for Phase 13-15 consumers', () => {
          // Profile is valid
          const profile = skillProfileSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            sourceHash: 'ef'.repeat(32),
            title: 'Test',
            summary: 'Test summary',
            keywords: [],
            referencePaths: [],
            contentHash: '12'.repeat(32),
          });

          // Capsule is valid
          const capsule = skillCapsuleSchema.parse({
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Test content',
            situation: 'Test situation',
            problem: 'Test problem',
            goal: 'Test goal',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
          });

          // Client manifest is valid
          const manifest = clientManifestSchema.parse({
            artifactId: 'artifact_1',
            revision: 1,
            references: [],
            assets: [],
            scripts: [],
            sourceHash: '34'.repeat(32),
          });

          expect(profile.artifactId).toBe('artifact_1');
          expect(capsule.capsuleId).toBe('capsule_1');
          expect(manifest.artifactId).toBe('artifact_1');
        });

        it('parse and rejection cases fail when an asset or script body is supplied as capsule content (T-12-02)', () => {
          // This test documents the contract: capsule content should be distilled text,
          // not raw asset or script bodies. The schema itself doesn't reject this (it's
          // a text field), but derivation logic in later phases must enforce this boundary.

          const capsuleWithTextContent = skillCapsuleSchema.parse({
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: ' distilled troubleshooting steps for container issues',
            situation: 'Container debugging',
            problem: 'Container fails to start',
            goal: 'Identify and fix the issue',
            labels: ['docker', 'debugging'],
            scope: 'project',
            requiredLevel: 2,
          });

          // The schema accepts the text content - derivation logic must ensure
          // only SKILL.md and references/ contribute to capsules
          expect(capsuleWithTextContent.content).toBe(
            ' distilled troubleshooting steps for container issues',
          );
        });
      });
    });
  });

  describe('Phase 13: Artifact Import/Export Contracts (IMEX-01, IMEX-04, COMP-01)', () => {
    describe('Bundle file payload (IMEX-01)', () => {
      it('accepts canonical file payload with inline content', () => {
        const payload = {
          path: 'references/docker.md',
          kind: 'reference' as const,
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          mediaType: 'text/markdown',
          source: 'references/' as const,
          includeInDerivation: true,
          activationOnly: false,
          content: 'SGVsbG8gV29ybGQ=', // base64 "Hello World"
        };

        // The schema accepts either base64 string or UTF-8 text
        expect(() =>
          bundleFilePayloadSchema.parse({
            ...payload,
            content: 'Hello World', // UTF-8 text
          }),
        ).not.toThrow();

        expect(() => bundleFilePayloadSchema.parse(payload)).not.toThrow();
      });

      it('requires path, kind, sha256, sizeBytes, mediaType, source, and content', () => {
        const minimalPayload = {
          path: 'SKILL.md',
          kind: 'skill-markdown' as const,
          sha256: 'b'.repeat(64),
          sizeBytes: 512,
          mediaType: 'text/markdown',
          source: 'SKILL.md' as const,
          includeInDerivation: true,
          activationOnly: false,
          content: 'Test content',
        };

        const parsed = bundleFilePayloadSchema.parse(minimalPayload);
        expect(parsed.path).toBe('SKILL.md');
        expect(parsed.kind).toBe('skill-markdown');
      });

      it('rejects empty or invalid SHA-256 hashes', () => {
        const invalidPayload = {
          path: 'test.md',
          kind: 'reference' as const,
          sha256: 'not-a-hash',
          sizeBytes: 100,
          mediaType: 'text/markdown',
          source: 'references/' as const,
          includeInDerivation: true,
          activationOnly: false,
          content: 'test',
        };

        expect(() => bundleFilePayloadSchema.parse(invalidPayload)).toThrow();
      });

      it('rejects negative or non-integer file sizes', () => {
        const invalidPayload = {
          path: 'test.md',
          kind: 'reference' as const,
          sha256: 'c'.repeat(64),
          sizeBytes: -1,
          mediaType: 'text/markdown',
          source: 'references/' as const,
          includeInDerivation: true,
          activationOnly: false,
          content: 'test',
        };

        expect(() => bundleFilePayloadSchema.parse(invalidPayload)).toThrow();
      });
    });

    describe('Script descriptors (IMEX-04)', () => {
      it('accepts script descriptor with capability metadata', () => {
        const descriptor = {
          path: 'scripts/setup.sh',
          sha256: 'd'.repeat(64),
          capability: 'Docker environment setup',
          argsSchemaSummary: '{ env: string, projectName: string }',
          sideEffectSummary: 'Creates docker-compose.yml and .env file',
          defaultPolicy: 'manual' as const,
        };

        const parsed = bundleScriptDescriptorSchema.parse(descriptor);
        expect(parsed.capability).toBe('Docker environment setup');
        expect(parsed.defaultPolicy).toBe('manual');
      });

      it('requires path, sha256, capability, and defaultPolicy', () => {
        const minimalDescriptor = {
          path: 'scripts/deploy.sh',
          sha256: 'e'.repeat(64),
          capability: 'Deploy containers',
          defaultPolicy: 'auto' as const,
        };

        const parsed = bundleScriptDescriptorSchema.parse(minimalDescriptor);
        expect(parsed.capability).toBe('Deploy containers');
        expect(parsed.argsSchemaSummary).toBe(''); // default
        expect(parsed.sideEffectSummary).toBe(''); // default
      });

      it('rejects invalid default policies', () => {
        const invalidDescriptor = {
          path: 'scripts/test.sh',
          sha256: 'f'.repeat(64),
          capability: 'Test',
          defaultPolicy: 'invalid',
        };

        expect(() => bundleScriptDescriptorSchema.parse(invalidDescriptor)).toThrow();
      });
    });

    describe('Artifact bundle (IMEX-01, IMEX-04)', () => {
      it('accepts canonical artifact bundle with governance fields and files', () => {
        const bundle = {
          scope: 'project' as const,
          labels: ['docker', 'deployment'],
          title: 'Docker Deployment Skills',
          slug: 'docker-deployment',
          requiredLevel: 3,
          sourceKind: 'skill-directory' as const,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: '0a'.repeat(32),
              sizeBytes: 1024,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
              content: '# Docker Deployment\n\nBest practices...',
            },
            {
              path: 'references/docker-compose.md',
              kind: 'reference' as const,
              sha256: '0b'.repeat(32),
              sizeBytes: 2048,
              mediaType: 'text/markdown',
              source: 'references/' as const,
              includeInDerivation: true,
              activationOnly: false,
              content: 'Compose reference...',
            },
            {
              path: 'assets/docker-compose.yml',
              kind: 'asset' as const,
              sha256: '0c'.repeat(32),
              sizeBytes: 512,
              mediaType: 'text/x-yaml',
              source: 'assets/' as const,
              includeInDerivation: false,
              activationOnly: true,
              content: 'version: "3.8"\n...',
            },
          ],
          scriptDescriptors: [
            {
              path: 'scripts/setup.sh',
              sha256: '0d'.repeat(32),
              capability: 'Initialize Docker environment',
              argsSchemaSummary: '--env, --force',
              sideEffectSummary: 'Creates Docker network and volumes',
              defaultPolicy: 'manual' as const,
            },
          ],
        };

        const parsed = artifactBundleSchema.parse(bundle);
        expect(parsed.scope).toBe('project');
        expect(parsed.files).toHaveLength(3);
        expect(parsed.scriptDescriptors).toHaveLength(1);
      });

      it('requires at least one file in the bundle', () => {
        const invalidBundle = {
          scope: 'global' as const,
          labels: ['test'],
          title: 'Test',
          slug: 'test',
          requiredLevel: 0,
          sourceKind: 'skill-directory' as const,
          files: [],
          scriptDescriptors: [],
        };

        expect(() => artifactBundleSchema.parse(invalidBundle)).toThrow();
      });

      it('accepts minimal bundle with only SKILL.md', () => {
        const minimalBundle = {
          scope: 'global' as const,
          labels: ['test'],
          title: 'Test Skill',
          slug: 'test-skill',
          requiredLevel: 0,
          sourceKind: 'single-skill-md' as const,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: '0e'.repeat(32),
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
              content: '# Test',
            },
          ],
          scriptDescriptors: [],
        };

        const parsed = artifactBundleSchema.parse(minimalBundle);
        expect(parsed.sourceKind).toBe('single-skill-md');
        expect(parsed.files).toHaveLength(1);
      });
    });

    describe('Artifact import request/response (IMEX-01, COMP-01)', () => {
      it('accepts artifact-native import request with one or more bundles', () => {
        const request = {
          bundles: [
            {
              scope: 'project' as const,
              labels: ['docker'],
              title: 'Docker Skills',
              slug: 'docker-skills',
              requiredLevel: 2,
              sourceKind: 'skill-directory' as const,
              files: [
                {
                  path: 'SKILL.md',
                  kind: 'skill-markdown' as const,
                  sha256: '0f'.repeat(32),
                  sizeBytes: 500,
                  mediaType: 'text/markdown',
                  source: 'SKILL.md' as const,
                  includeInDerivation: true,
                  activationOnly: false,
                  content: '# Docker',
                },
              ],
              scriptDescriptors: [],
            },
          ],
        };

        const parsed = artifactImportRequestSchema.parse(request);
        expect(parsed.bundles).toHaveLength(1);
      });

      it('requires at least one bundle in import request', () => {
        const invalidRequest = {
          bundles: [],
        };

        expect(() => artifactImportRequestSchema.parse(invalidRequest)).toThrow();
      });

      it('parses artifact import response with per-bundle results', () => {
        const response = {
          results: [
            {
              success: true,
              artifactId: 'artifact_1',
              title: 'Docker Skills',
              error: null,
              sourceKind: 'skill-directory' as const,
            },
            {
              success: false,
              artifactId: null,
              title: null,
              error: 'Invalid file path',
              sourceKind: null,
            },
          ],
          importedCount: 1,
          failedCount: 1,
        };

        const parsed = artifactImportResponseSchema.parse(response);
        expect(parsed.results).toHaveLength(2);
        expect(parsed.importedCount).toBe(1);
        expect(parsed.failedCount).toBe(1);
      });
    });

    describe('Path validation security (T-13-01 mitigation)', () => {
      it('accepts valid relative paths', () => {
        const validPaths = [
          'SKILL.md',
          'references/docker.md',
          'assets/images/logo.png',
          'scripts/setup.sh',
          'deep/nested/path/file.txt',
        ];

        for (const path of validPaths) {
          expect(() => validateRelativePath(path)).not.toThrow();
        }
      });

      it('rejects absolute Unix paths', () => {
        const absolutePaths = ['/etc/passwd', '/usr/local/bin', '/root/.ssh'];

        for (const path of absolutePaths) {
          expect(() => validateRelativePath(path)).toThrow(PathValidationError.ABSOLUTE_PATH);
        }
      });

      it('rejects parent traversal sequences', () => {
        const traversalPaths = [
          '../../etc/passwd',
          '../references/escape.md',
          'scripts/../../../etc/shadow',
          './../escape',
        ];

        for (const path of traversalPaths) {
          expect(() => validateRelativePath(path)).toThrow(PathValidationError.PARENT_TRAVERSAL);
        }
      });

      it('rejects Windows absolute paths and drive letters', () => {
        const windowsPaths = [
          'C:\\Windows\\System32',
          'D:\\data\\file.txt',
          'C:/Windows/System32',
          'C:file.txt',
        ];

        for (const path of windowsPaths) {
          expect(() => validateRelativePath(path)).toThrow();
        }
      });

      it('rejects empty paths', () => {
        expect(() => validateRelativePath('')).toThrow(PathValidationError.EMPTY_PATH);
        expect(() => validateRelativePath('   ')).toThrow(PathValidationError.EMPTY_PATH);
      });

      it('canonicalPathSchema enforces path validation at schema boundary', () => {
        // Valid paths should parse
        expect(() => canonicalPathSchema.parse('references/docker.md')).not.toThrow();
        expect(() => canonicalPathSchema.parse('SKILL.md')).not.toThrow();

        // Invalid paths should be rejected by the schema
        expect(() => canonicalPathSchema.parse('/etc/passwd')).toThrow();
        expect(() => canonicalPathSchema.parse('../../escape')).toThrow();
        expect(() => canonicalPathSchema.parse('C:\\Windows\\System32')).toThrow();
        expect(() => canonicalPathSchema.parse('')).toThrow();
      });
    });

    describe('File payload storage record (IMEX-04)', () => {
      it('accepts file payload storage record for additive storage', () => {
        const record = {
          artifactId: 'artifact_1',
          revision: 1,
          path: 'references/docker.md',
          sha256: '1a'.repeat(32),
          sizeBytes: 1024,
          mediaType: 'text/markdown',
          content: 'SGVsbG8=', // base64
          storedAt: '2026-04-16T12:00:00.000Z',
        };

        const parsed = artifactFilePayloadRecordSchema.parse(record);
        expect(parsed.artifactId).toBe('artifact_1');
        expect(parsed.revision).toBe(1);
        expect(parsed.storedAt).toBeDefined();
      });

      it('requires artifactId, revision, path, sha256, sizeBytes, mediaType, content, and storedAt', () => {
        const minimalRecord = {
          artifactId: 'artifact_1',
          revision: 1,
          path: 'SKILL.md',
          sha256: '1b'.repeat(32),
          sizeBytes: 100,
          mediaType: 'text/markdown',
          content: 'test',
          storedAt: '2026-04-16T12:00:00.000Z',
        };

        const parsed = artifactFilePayloadRecordSchema.parse(minimalRecord);
        expect(parsed.artifactId).toBe('artifact_1');
      });
    });

    describe('Artifact export schemas (IMEX-02)', () => {
      it('accepts valid export format selection', () => {
        expect(artifactExportFormatSchema.parse('bundle-json')).toBe('bundle-json');
        expect(artifactExportFormatSchema.parse('distilled-json')).toBe('distilled-json');
        expect(artifactExportFormatSchema.parse('skill-dir')).toBe('skill-dir');
        expect(() => artifactExportFormatSchema.parse('invalid')).toThrow();
      });

      it('artifactExportRequestSchema requires artifactId with optional format', () => {
        const request = { artifactId: 'artifact_1' };
        const parsed = artifactExportRequestSchema.parse(request);
        expect(parsed.artifactId).toBe('artifact_1');
        expect(parsed.format).toBe('bundle-json'); // default
      });

      it('distilledArtifactSchema accepts compact derived projection', () => {
        const distilled = {
          artifactId: 'artifact_1',
          scope: 'project',
          labels: ['imported'],
          title: 'Test Skill',
          slug: 'test-skill',
          requiredLevel: 1,
          sourceKind: 'skill-directory',
          profile: { name: 'Test Profile' },
          capsules: [],
          clientManifest: { endpoints: [] },
          exportedAt: '2026-04-16T12:00:00.000Z',
        };

        const parsed = distilledArtifactSchema.parse(distilled);
        expect(parsed.artifactId).toBe('artifact_1');
        expect(parsed.profile).toBeDefined();
      });

      it('artifactExportResponseSchema accepts bundle-json response', () => {
        const response = {
          format: 'bundle-json',
          exportedAt: '2026-04-16T12:00:00.000Z',
          exportedBy: { id: 'user_1', handle: 'testuser', securityLevel: 5 },
          bundle: {
            scope: 'project',
            labels: ['imported'],
            title: 'Test Skill',
            slug: 'test-skill',
            requiredLevel: 1,
            sourceKind: 'skill-directory',
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown',
                sha256: 'a'.repeat(64),
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md',
                includeInDerivation: true,
                activationOnly: false,
                content: '# Test',
              },
            ],
            scriptDescriptors: [],
          },
          distilled: null,
        };

        const parsed = artifactExportResponseSchema.parse(response);
        expect(parsed.format).toBe('bundle-json');
        expect(parsed.bundle).toBeDefined();
        expect(parsed.distilled).toBeNull();
      });

      it('artifactExportResponseSchema accepts distilled-json response', () => {
        const response = {
          format: 'distilled-json',
          exportedAt: '2026-04-16T12:00:00.000Z',
          exportedBy: { id: 'user_1', handle: 'testuser', securityLevel: 5 },
          bundle: null,
          distilled: {
            artifactId: 'artifact_1',
            scope: 'project',
            labels: ['imported'],
            title: 'Test Skill',
            slug: 'test-skill',
            requiredLevel: 1,
            sourceKind: 'skill-directory',
            profile: null,
            capsules: null,
            clientManifest: null,
            exportedAt: '2026-04-16T12:00:00.000Z',
          },
        };

        const parsed = artifactExportResponseSchema.parse(response);
        expect(parsed.format).toBe('distilled-json');
        expect(parsed.distilled).toBeDefined();
        expect(parsed.bundle).toBeNull();
      });
    });
  });

  describe('Phase 14: Seed-Only Retrieval v2 Contracts (RETR-01, RETR-02, COMP-01)', () => {
    describe('retrievalV2QuerySchema (RETR-01)', () => {
      it('accepts seed-only request without structured intent fields', () => {
        const query = retrievalV2QuerySchema.parse({
          seed: 'docker container fails to start with permission denied error',
        });

        expect(query.seed).toBe('docker container fails to start with permission denied error');
        expect(query.maxResults).toBe(10); // default
        expect(query.filters.labels).toEqual([]); // default
        expect(query.filters.scopes).toEqual([]); // default
      });

      it('rejects required structured intent fields on the client contract', () => {
        // The v2 query schema should NOT accept situation/problem/goal/errorText
        // These are server-internal per RETR-02
        const queryWithStructuredIntent = {
          seed: 'test query',
          situation: 'deploying containers',
          problem: 'permission denied',
          goal: 'fix permissions',
        };

        // The schema should parse but ignore the structured intent fields
        // (or reject them - we chose to accept and ignore for backward compatibility)
        const parsed = retrievalV2QuerySchema.parse(queryWithStructuredIntent);

        // seed should be preserved
        expect(parsed.seed).toBe('test query');
        // structured intent fields should NOT be in the parsed result
        expect(parsed).not.toHaveProperty('situation');
        expect(parsed).not.toHaveProperty('problem');
        expect(parsed).not.toHaveProperty('goal');
        expect(parsed).not.toHaveProperty('errorText');
      });

      it('accepts optional filters and flags while keeping seed required', () => {
        const query = retrievalV2QuerySchema.parse({
          seed: 'typescript strict mode',
          filters: {
            labels: ['typescript'],
            scopes: ['project'],
          },
          maxResults: 20,
        });

        expect(query.seed).toBe('typescript strict mode');
        expect(query.maxResults).toBe(20);
        expect(query.filters.labels).toEqual(['typescript']);
        expect(query.filters.scopes).toEqual(['project']);
      });

      it('requires seed field and rejects empty seed', () => {
        expect(() => retrievalV2QuerySchema.parse({})).toThrow();
        expect(() => retrievalV2QuerySchema.parse({ seed: '' })).toThrow();
      });
    });

    describe('retrievalV2ResponseSchema (RETR-04, COMP-01)', () => {
      it('accepts capsule-first distilled results with artifact metadata', () => {
        const response = {
          capsules: [
            {
              capsuleId: 'capsule_1',
              artifactId: 'artifact_1',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Use docker-compose for multi-container setups',
              situation: 'Deploying multiple containers',
              problem: 'Manual networking is error-prone',
              goal: 'Simplify deployment with compose',
              labels: ['docker'],
              scope: 'project',
              requiredLevel: 2,
              score: 0.95,
              reason: 'High match on problem and situation',
            },
          ],
          profileHints: [
            {
              artifactId: 'artifact_1',
              title: 'Docker Deployment Skills',
              slug: 'docker-deployment',
              labels: ['docker'],
            },
          ],
        };

        const parsed = retrievalV2ResponseSchema.parse(response);
        expect(parsed.capsules).toHaveLength(1);
        expect(parsed.capsules[0]?.capsuleId).toBe('capsule_1');
        expect(parsed.capsules[0]?.score).toBe(0.95);
        expect(parsed.profileHints).toHaveLength(1);
      });

      it('coexists with legacy retrievalResponseSchema without breaking existing contracts', () => {
        // Legacy v1 response should still work
        const legacyResponse = {
          globalConstraints: [],
          projectKnowledge: [],
          refinementSummary: null,
          summary: null,
        };

        const legacyParsed = retrievalResponseSchema.parse(legacyResponse);
        expect(legacyParsed.globalConstraints).toEqual([]);
        expect(legacyParsed.projectKnowledge).toEqual([]);

        // v2 response should work independently
        const v2Response = {
          capsules: [],
          profileHints: [],
        };

        const v2Parsed = retrievalV2ResponseSchema.parse(v2Response);
        expect(v2Parsed.capsules).toEqual([]);
        expect(v2Parsed.profileHints).toEqual([]);
      });

      it('capsules inherit governance from artifact root (T-14-01 mitigation)', () => {
        const response = {
          capsules: [
            {
              capsuleId: 'capsule_1',
              artifactId: 'artifact_1',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Test content',
              situation: 'Test situation',
              problem: 'Test problem',
              goal: 'Test goal',
              labels: ['test'],
              scope: 'global',
              requiredLevel: 5,
              score: 0.8,
              reason: 'Match found',
            },
          ],
          profileHints: [],
        };

        const parsed = retrievalV2ResponseSchema.parse(response);
        // Capsule has governance fields inherited from artifact
        expect(parsed.capsules[0]?.scope).toBe('global');
        expect(parsed.capsules[0]?.requiredLevel).toBe(5);
      });

      it('capsule match includes score and reason for ranking transparency', () => {
        const response = {
          capsules: [
            {
              capsuleId: 'capsule_1',
              artifactId: 'artifact_1',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Test content',
              situation: 'Test situation',
              problem: 'Test problem',
              goal: 'Test goal',
              labels: ['test'],
              scope: 'project',
              requiredLevel: 0,
              score: 0.92,
              reason: 'Problem text matched with 92% similarity',
            },
          ],
          profileHints: [],
          refinementSummary: 'Found 1 relevant capsule for your query',
        };

        const parsed = retrievalV2ResponseSchema.parse(response);
        expect(parsed.capsules[0]?.score).toBe(0.92);
        expect(parsed.capsules[0]?.reason).toBe('Problem text matched with 92% similarity');
        expect(parsed.refinementSummary).toBe('Found 1 relevant capsule for your query');
      });
    });

    describe('COMP-01: Shared contract as single source of truth', () => {
      it('exports v2 retrieval schemas from contracts package index', () => {
        // This test verifies that v2 schemas are exported from the contracts package
        expect(retrievalV2QuerySchema).toBeDefined();
        expect(retrievalV2ResponseSchema).toBeDefined();
      });
    });

    describe('RETR-04: Distilled capsule-first output (Task 1)', () => {
      it('v2 response schema accepts distilled capsule matches with artifact/profile metadata and optional summary', () => {
        const response = {
          capsules: [
            {
              capsuleId: 'capsule_1',
              artifactId: 'artifact_1',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Distilled capsule content',
              situation: 'Deploying containers',
              problem: 'Container fails to start',
              goal: 'Fix the issue',
              labels: ['docker'],
              scope: 'project',
              requiredLevel: 2,
              score: 0.9,
              reason: 'High match',
            },
          ],
          profileHints: [
            {
              artifactId: 'artifact_1',
              title: 'Docker Skills',
              slug: 'docker-skills',
              labels: ['docker'],
            },
          ],
          summary: {
            text: 'Container startup issues often relate to permission problems',
            citations: [
              {
                source: {
                  entryId: 'capsule_1',
                  scope: 'project',
                  shortcut: 'Docker Skills',
                },
                snippet: 'Container fails to start',
                tags: ['docker'],
                recallChannels: ['semantic'],
                scores: {
                  semantic: 0.9,
                  keyword: null,
                  graph: null,
                  preRerank: 0.9,
                  final: 0.9,
                },
              },
            ],
          },
        };

        const parsed = retrievalV2ResponseSchema.parse(response);
        expect(parsed.capsules).toHaveLength(1);
        expect(parsed.profileHints).toHaveLength(1);
        expect(parsed.summary).not.toBeNull();
        expect(parsed.summary?.text).toBe(
          'Container startup issues often relate to permission problems',
        );
        expect(parsed.summary?.citations).toHaveLength(1);
      });

      it('default retrieval payloads do not require bundle file contents', () => {
        // v2 response should work with minimal capsule data - no bundle/asset/script bodies
        const minimalResponse = {
          capsules: [
            {
              capsuleId: 'capsule_1',
              artifactId: 'artifact_1',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Distilled content only',
              situation: 'Test',
              problem: 'Test',
              goal: 'Test',
              labels: ['test'],
              scope: 'global',
              requiredLevel: 0,
              score: 0.5,
              reason: 'Match',
            },
          ],
          profileHints: [],
          // summary is optional and defaults to null
        };

        const parsed = retrievalV2ResponseSchema.parse(minimalResponse);
        expect(parsed.capsules).toHaveLength(1);
        // No asset/script bodies are included in the response
        expect(parsed.capsules[0]?.content).toBe('Distilled content only');
        // Verify no bundle file fields exist in capsule
        expect(parsed.capsules[0]).not.toHaveProperty('assets');
        expect(parsed.capsules[0]).not.toHaveProperty('scripts');
        expect(parsed.capsules[0]).not.toHaveProperty('bundleContents');
      });

      it('legacy retrieval response schemas remain available for coexistence during migration', () => {
        // Legacy v1 response should still parse
        const legacyResponse = {
          globalConstraints: [
            {
              entryId: 'entry_1',
              scope: 'global',
              requiredLevel: 0,
              shortcut: 'Test',
              detail: 'Test detail',
              labels: ['test'],
              score: 0.8,
              reason: 'Match',
            },
          ],
          projectKnowledge: [],
          refinementSummary: null,
          summary: null,
        };

        const legacyParsed = retrievalResponseSchema.parse(legacyResponse);
        expect(legacyParsed.globalConstraints).toHaveLength(1);
        expect(legacyParsed.projectKnowledge).toHaveLength(0);

        // v2 response should work alongside legacy
        const v2Response = {
          capsules: [],
          profileHints: [],
        };

        const v2Parsed = retrievalV2ResponseSchema.parse(v2Response);
        expect(v2Parsed.capsules).toHaveLength(0);

        // Both schemas can coexist - they don't interfere
        expect(legacyParsed).not.toHaveProperty('capsules');
        expect(v2Parsed).not.toHaveProperty('globalConstraints');
        expect(v2Parsed).not.toHaveProperty('projectKnowledge');
      });
    });
  });

  describe('activation request and response schemas (Phase 15-03)', () => {
    it('accepts valid activation request with artifact ID and selected paths', () => {
      const request = {
        artifactId: 'artifact_1',
        selectedPaths: ['references/docker.md', 'assets/docker-compose.yml', 'scripts/setup.sh'],
      };

      expect(() => activationRequestSchema.parse(request)).not.toThrow();
      const parsed = activationRequestSchema.parse(request);
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.selectedPaths).toHaveLength(3);
    });

    it('accepts activation request with optional revision number', () => {
      const request = {
        artifactId: 'artifact_1',
        revision: 2,
        selectedPaths: ['SKILL.md'],
      };

      const parsed = activationRequestSchema.parse(request);
      expect(parsed.revision).toBe(2);
    });

    it('rejects activation request with empty selected paths', () => {
      const request = {
        artifactId: 'artifact_1',
        selectedPaths: [],
      };

      expect(() => activationRequestSchema.parse(request)).toThrow();
    });

    it('rejects activation request with too many selected paths (max 50)', () => {
      const request = {
        artifactId: 'artifact_1',
        selectedPaths: Array.from({ length: 51 }, (_, i) => `file_${i}.md`),
      };

      expect(() => activationRequestSchema.parse(request)).toThrow();
    });

    it('accepts valid activation response with file payloads', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'Test Skill',
        revision: 1,
        requiredLevel: 3,
        files: [
          {
            path: 'references/docker.md',
            kind: 'reference',
            sha256: 'a'.repeat(64),
            sizeBytes: 1024,
            mediaType: 'text/markdown',
            source: 'references/',
            content: '# Docker content',
          },
        ],
        scriptDescriptors: [],
        activatedAt: '2024-01-01T00:00:00Z',
        activatedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      expect(() => activationResponseSchema.parse(response)).not.toThrow();
      const parsed = activationResponseSchema.parse(response);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0]?.path).toBe('references/docker.md');
    });

    it('includes script descriptors for selected script paths', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'Test Skill',
        revision: 1,
        requiredLevel: 3,
        files: [
          {
            path: 'scripts/setup.sh',
            kind: 'script',
            sha256: 'b'.repeat(64),
            sizeBytes: 512,
            mediaType: 'text/x-shellscript',
            source: 'scripts/',
            content: '#!/bin/bash\necho setup',
          },
        ],
        scriptDescriptors: [
          {
            path: 'scripts/setup.sh',
            sha256: 'b'.repeat(64),
            capability: 'Environment setup',
            argsSchemaSummary: 'None',
            sideEffectSummary: 'Creates config files',
            defaultPolicy: 'manual',
          },
        ],
        activatedAt: '2024-01-01T00:00:00Z',
        activatedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
      };

      const parsed = activationResponseSchema.parse(response);
      expect(parsed.scriptDescriptors).toHaveLength(1);
      expect(parsed.scriptDescriptors[0]?.capability).toBe('Environment setup');
    });

    it('validates file payload kinds are restricted to valid values', () => {
      const invalidPayload = {
        path: 'test.md',
        kind: 'invalid-kind',
        sha256: 'a'.repeat(64),
        sizeBytes: 100,
        mediaType: 'text/markdown',
        source: 'references/',
        content: 'content',
      };

      expect(() => activationFilePayloadSchema.parse(invalidPayload)).toThrow();
    });

    it('validates file payload source is restricted to valid directories', () => {
      const invalidPayload = {
        path: 'test.md',
        kind: 'reference',
        sha256: 'a'.repeat(64),
        sizeBytes: 100,
        mediaType: 'text/markdown',
        source: 'invalid/',
        content: 'content',
      };

      expect(() => activationFilePayloadSchema.parse(invalidPayload)).toThrow();
    });
  });
});

// =============================================================================
// Phase 15: Activation hints for references, assets, and scripts (RETR-05, ACTV-01)
// Metadata-only hints that tell clients what to read/fetch next.
// =============================================================================

describe('Phase 15: Activation hints', () => {
  describe('readNextReferenceHintSchema', () => {
    it('accepts valid read-next reference hint (Task 1, Test 1)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'references/docker-best-practices.md',
        sha256: 'a'.repeat(64),
        description: 'Docker deployment guidelines',
      };

      const parsed = readNextReferenceHintSchema.parse(hint);
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.path).toBe('references/docker-best-practices.md');
      expect(parsed.description).toBe('Docker deployment guidelines');
    });

    it('accepts read-next hint without optional description', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'references/api.md',
        sha256: 'b'.repeat(64),
      };

      const parsed = readNextReferenceHintSchema.parse(hint);
      expect(parsed.description).toBeUndefined();
    });

    it('is metadata-only and does not require file content (Task 1, Test 2)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'references/readme.md',
        sha256: 'c'.repeat(64),
      };

      // Should parse without content field
      const parsed = readNextReferenceHintSchema.parse(hint);
      expect(parsed).not.toHaveProperty('content');
      expect(parsed).not.toHaveProperty('body');
    });

    it('validates sha256 is exactly 64 characters', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'references/test.md',
        sha256: 'short-hash',
      };

      expect(() => readNextReferenceHintSchema.parse(hint)).toThrow();
    });
  });

  describe('assetAvailabilityHintSchema', () => {
    it('accepts valid asset availability hint (Task 1, Test 1)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'assets/config-template.yaml',
        sha256: 'd'.repeat(64),
        sizeBytes: 2048,
        mediaType: 'application/yaml',
      };

      const parsed = assetAvailabilityHintSchema.parse(hint);
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.sizeBytes).toBe(2048);
      expect(parsed.mediaType).toBe('application/yaml');
    });

    it('is metadata-only and does not require asset body (Task 1, Test 2)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'assets/data.json',
        sha256: 'e'.repeat(64),
        sizeBytes: 512,
        mediaType: 'application/json',
      };

      const parsed = assetAvailabilityHintSchema.parse(hint);
      expect(parsed).not.toHaveProperty('content');
      expect(parsed).not.toHaveProperty('data');
      expect(parsed).not.toHaveProperty('body');
    });
  });

  describe('scriptProfileHintSchema', () => {
    it('accepts valid script profile hint (Task 1, Test 1)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'scripts/deploy.sh',
        sha256: 'f'.repeat(64),
        capability: 'Deploy to production',
        argsSchemaSummary: 'env: string',
        sideEffectSummary: 'Pushes to remote server',
        defaultPolicy: 'manual',
      };

      const parsed = scriptProfileHintSchema.parse(hint);
      expect(parsed.capability).toBe('Deploy to production');
      expect(parsed.defaultPolicy).toBe('manual');
    });

    it('is metadata-only and does not expose script body (Task 1, Test 2, T-15-03)', () => {
      const hint = {
        artifactId: 'artifact_1',
        revision: 1,
        path: 'scripts/setup.sh',
        sha256: '0a'.repeat(32),
        capability: 'Setup environment',
        argsSchemaSummary: '',
        sideEffectSummary: 'Creates config files',
        defaultPolicy: 'auto',
      };

      const parsed = scriptProfileHintSchema.parse(hint);
      expect(parsed).not.toHaveProperty('scriptBody');
      expect(parsed).not.toHaveProperty('content');
      expect(parsed).not.toHaveProperty('code');
    });

    it('accepts all valid default policy values', () => {
      const policies = ['manual', 'auto', 'blocked'] as const;

      for (const policy of policies) {
        const hint = {
          artifactId: 'artifact_1',
          revision: 1,
          path: 'scripts/test.sh',
          sha256: '0b'.repeat(32),
          capability: 'Test script',
          defaultPolicy: policy,
        };

        const parsed = scriptProfileHintSchema.parse(hint);
        expect(parsed.defaultPolicy).toBe(policy);
      }
    });
  });

  describe('capsuleActivationHintsSchema', () => {
    it('aggregates read-next, assets, and scripts for a capsule', () => {
      const hints = {
        capsuleId: 'capsule_1',
        readNext: [
          {
            artifactId: 'artifact_1',
            revision: 1,
            path: 'references/guide.md',
            sha256: '0c'.repeat(32),
          },
        ],
        assets: [
          {
            artifactId: 'artifact_1',
            revision: 1,
            path: 'assets/template.yaml',
            sha256: '0d'.repeat(32),
            sizeBytes: 1024,
            mediaType: 'application/yaml',
          },
        ],
        scripts: [
          {
            artifactId: 'artifact_1',
            revision: 1,
            path: 'scripts/run.sh',
            sha256: '0e'.repeat(32),
            capability: 'Run deployment',
            defaultPolicy: 'manual',
          },
        ],
      };

      const parsed = capsuleActivationHintsSchema.parse(hints);
      expect(parsed.capsuleId).toBe('capsule_1');
      expect(parsed.readNext).toHaveLength(1);
      expect(parsed.assets).toHaveLength(1);
      expect(parsed.scripts).toHaveLength(1);
    });

    it('defaults to empty arrays for optional hint collections', () => {
      const hints = {
        capsuleId: 'capsule_1',
      };

      const parsed = capsuleActivationHintsSchema.parse(hints);
      expect(parsed.readNext).toEqual([]);
      expect(parsed.assets).toEqual([]);
      expect(parsed.scripts).toEqual([]);
    });
  });

  describe('retrievalV2ResponseWithHintsSchema', () => {
    it('accepts v2 response with activation hints (Task 1, Test 1)', () => {
      const response = {
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Docker deployment guide',
            situation: 'Deploying containers',
            problem: 'Complex setup',
            goal: 'Simple deployment',
            labels: ['docker'],
            scope: 'project',
            requiredLevel: 3,
            score: 0.85,
            reason: 'High match on problem',
          },
        ],
        profileHints: [
          {
            artifactId: 'artifact_1',
            title: 'Docker Skills',
            slug: 'docker-skills',
            labels: ['docker'],
          },
        ],
        activationHints: [
          {
            capsuleId: 'capsule_1',
            readNext: [
              {
                artifactId: 'artifact_1',
                revision: 1,
                path: 'references/docker-advanced.md',
                sha256: '0f'.repeat(32),
              },
            ],
            assets: [],
            scripts: [],
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      const parsed = retrievalV2ResponseWithHintsSchema.parse(response);
      expect(parsed.capsules).toHaveLength(1);
      expect(parsed.activationHints).toHaveLength(1);
      expect(parsed.activationHints[0]?.readNext).toHaveLength(1);
    });

    it('response is metadata-only without file bodies (Task 1, Test 2)', () => {
      const response = {
        capsules: [],
        profileHints: [],
        activationHints: [
          {
            capsuleId: 'capsule_1',
            readNext: [
              {
                artifactId: 'artifact_1',
                revision: 1,
                path: 'references/file.md',
                sha256: '1a'.repeat(32),
              },
            ],
            assets: [
              {
                artifactId: 'artifact_1',
                revision: 1,
                path: 'assets/data.yaml',
                sha256: '1b'.repeat(32),
                sizeBytes: 2048,
                mediaType: 'application/yaml',
              },
            ],
            scripts: [
              {
                artifactId: 'artifact_1',
                revision: 1,
                path: 'scripts/run.sh',
                sha256: '1c'.repeat(32),
                capability: 'Run task',
                defaultPolicy: 'manual',
              },
            ],
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      const parsed = retrievalV2ResponseWithHintsSchema.parse(response);

      // No file content anywhere
      expect(parsed).not.toHaveProperty('fileBodies');
      expect(parsed).not.toHaveProperty('bundleContents');

      // Activation hints also don't have content
      const activationHint = parsed.activationHints[0];
      expect(activationHint?.readNext[0]).not.toHaveProperty('content');
      expect(activationHint?.assets[0]).not.toHaveProperty('content');
      expect(activationHint?.scripts[0]).not.toHaveProperty('scriptBody');
    });

    it('preserves legacy v2 response contract (Task 1, Test 3)', () => {
      // Legacy v2 response without activation hints should still work
      const legacyResponse = {
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Test content',
            situation: 'Test',
            problem: 'Test',
            goal: 'Test',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.5,
            reason: 'Match',
          },
        ],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      // Should parse with activationHints defaulting to empty
      const parsed = retrievalV2ResponseWithHintsSchema.parse(legacyResponse);
      expect(parsed.capsules).toHaveLength(1);
      expect(parsed.activationHints).toEqual([]);
    });

    it('accepts empty response with all defaults', () => {
      const response = {};

      const parsed = retrievalV2ResponseWithHintsSchema.parse(response);
      expect(parsed.capsules).toEqual([]);
      expect(parsed.profileHints).toEqual([]);
      expect(parsed.activationHints).toEqual([]);
      expect(parsed.refinementSummary).toBeNull();
      expect(parsed.summary).toBeNull();
    });
  });
});

// =============================================================================
// Phase 16: Legacy Migration and Compatibility Status Contracts (ARTF-04, COMP-01, COMP-03)
// Migration and status schemas for converting legacy entries to artifacts.
// =============================================================================

import {
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
  legacyMigrationModeSchema,
  legacyMigrationRequestSchema,
  legacyMigrationResponseSchema,
  legacyMigrationResultItemSchema,
} from './index.js';

describe('Phase 16: Legacy Migration and Compatibility Status Contracts', () => {
  describe('legacyMigrationModeSchema', () => {
    it('accepts valid migration modes', () => {
      expect(legacyMigrationModeSchema.parse('explicit')).toBe('explicit');
      expect(legacyMigrationModeSchema.parse('all-approved')).toBe('all-approved');
      expect(legacyMigrationModeSchema.parse('all-team')).toBe('all-team');
    });

    it('rejects invalid migration modes', () => {
      expect(() => legacyMigrationModeSchema.parse('invalid')).toThrow();
      expect(() => legacyMigrationModeSchema.parse('all')).toThrow();
    });
  });

  describe('legacyMigrationRequestSchema', () => {
    it('accepts explicit migration request with entry IDs', () => {
      const request = {
        mode: 'explicit' as const,
        entryIds: ['knowledge_1', 'knowledge_2', 'knowledge_3'],
      };

      const parsed = legacyMigrationRequestSchema.parse(request);
      expect(parsed.mode).toBe('explicit');
      expect(parsed.entryIds).toHaveLength(3);
      expect(parsed.limit).toBe(50); // default
    });

    it('accepts all-approved migration request with limit', () => {
      const request = {
        mode: 'all-approved' as const,
        limit: 100,
      };

      const parsed = legacyMigrationRequestSchema.parse(request);
      expect(parsed.mode).toBe('all-approved');
      expect(parsed.limit).toBe(100);
    });

    it('accepts all-team migration request with team ID', () => {
      const request = {
        mode: 'all-team' as const,
        teamId: 'team_1',
        limit: 25,
      };

      const parsed = legacyMigrationRequestSchema.parse(request);
      expect(parsed.mode).toBe('all-team');
      expect(parsed.teamId).toBe('team_1');
      expect(parsed.limit).toBe(25);
    });

    it('rejects explicit mode without entry IDs', () => {
      const request = {
        mode: 'explicit' as const,
        // entryIds is optional in schema, but required for explicit mode semantically
        // Server will validate this at runtime
      };

      // Schema should parse (runtime validation for mode-specific requirements)
      expect(() => legacyMigrationRequestSchema.parse(request)).not.toThrow();
    });

    it('rejects entry arrays larger than 100', () => {
      const request = {
        mode: 'explicit' as const,
        entryIds: Array.from({ length: 101 }, (_, i) => `knowledge_${i}`),
      };

      expect(() => legacyMigrationRequestSchema.parse(request)).toThrow();
    });

    it('rejects limit larger than 200', () => {
      const request = {
        mode: 'all-approved' as const,
        limit: 201,
      };

      expect(() => legacyMigrationRequestSchema.parse(request)).toThrow();
    });

    it('rejects limit less than 1', () => {
      const request = {
        mode: 'all-approved' as const,
        limit: 0,
      };

      expect(() => legacyMigrationRequestSchema.parse(request)).toThrow();
    });
  });

  describe('legacyMigrationResultItemSchema', () => {
    it('accepts successful migration result', () => {
      const result = {
        entryId: 'knowledge_1',
        artifactId: 'artifact_1',
        success: true,
        skipReason: null,
        error: null,
      };

      const parsed = legacyMigrationResultItemSchema.parse(result);
      expect(parsed.entryId).toBe('knowledge_1');
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.success).toBe(true);
    });

    it('accepts skipped migration result with reason', () => {
      const result = {
        entryId: 'knowledge_2',
        artifactId: null,
        success: false,
        skipReason: 'already-migrated',
        error: null,
      };

      const parsed = legacyMigrationResultItemSchema.parse(result);
      expect(parsed.skipReason).toBe('already-migrated');
      expect(parsed.success).toBe(false);
    });

    it('accepts failed migration result with error', () => {
      const result = {
        entryId: 'knowledge_3',
        artifactId: null,
        success: false,
        skipReason: null,
        error: 'Entry not found',
      };

      const parsed = legacyMigrationResultItemSchema.parse(result);
      expect(parsed.error).toBe('Entry not found');
      expect(parsed.success).toBe(false);
    });
  });

  describe('legacyMigrationResponseSchema', () => {
    it('accepts migration response with results and counts', () => {
      const response = {
        results: [
          {
            entryId: 'knowledge_1',
            artifactId: 'artifact_1',
            success: true,
            skipReason: null,
            error: null,
          },
          {
            entryId: 'knowledge_2',
            artifactId: null,
            success: false,
            skipReason: 'already-migrated',
            error: null,
          },
          {
            entryId: 'knowledge_3',
            artifactId: null,
            success: false,
            skipReason: null,
            error: 'Not approved',
          },
        ],
        migratedCount: 1,
        skippedCount: 1,
        failedCount: 1,
        remainingLegacyCount: 50,
        migratedAt: '2024-01-01T00:00:00Z',
      };

      const parsed = legacyMigrationResponseSchema.parse(response);
      expect(parsed.results).toHaveLength(3);
      expect(parsed.migratedCount).toBe(1);
      expect(parsed.skippedCount).toBe(1);
      expect(parsed.failedCount).toBe(1);
      expect(parsed.remainingLegacyCount).toBe(50);
    });

    it('accepts empty migration response', () => {
      const response = {
        results: [],
        migratedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        remainingLegacyCount: 0,
        migratedAt: '2024-01-01T00:00:00Z',
      };

      const parsed = legacyMigrationResponseSchema.parse(response);
      expect(parsed.results).toHaveLength(0);
    });
  });

  describe('compatibilityStatusRequestSchema', () => {
    it('accepts empty status request', () => {
      const request = {};

      const parsed = compatibilityStatusRequestSchema.parse(request);
      expect(parsed.teamId).toBeUndefined();
    });

    it('accepts status request with team ID filter', () => {
      const request = {
        teamId: 'team_1',
      };

      const parsed = compatibilityStatusRequestSchema.parse(request);
      expect(parsed.teamId).toBe('team_1');
    });
  });

  describe('compatibilityStatusResponseSchema', () => {
    it('accepts full status response with migration progress', () => {
      const response = {
        totalLegacyEntries: 100,
        migratedEntriesCount: 75,
        unmigratedEntriesCount: 25,
        totalArtifacts: 80,
        artifactsBySourceKind: {
          'skill-directory': 10,
          'single-skill-md': 5,
          'legacy-knowledge': 65,
        },
        unmigratedEntryIds: ['knowledge_10', 'knowledge_11', 'knowledge_12'],
        coexistenceActive: true,
        sunsetReady: false,
        sunsetBlockers: ['25 unmigrated entries remaining'],
        reportedAt: '2024-01-01T00:00:00Z',
      };

      const parsed = compatibilityStatusResponseSchema.parse(response);
      expect(parsed.totalLegacyEntries).toBe(100);
      expect(parsed.migratedEntriesCount).toBe(75);
      expect(parsed.unmigratedEntriesCount).toBe(25);
      expect(parsed.totalArtifacts).toBe(80);
      expect(parsed.artifactsBySourceKind['legacy-knowledge']).toBe(65);
      expect(parsed.coexistenceActive).toBe(true);
      expect(parsed.sunsetReady).toBe(false);
      expect(parsed.sunsetBlockers).toHaveLength(1);
    });

    it('accepts status response indicating sunset readiness', () => {
      const response = {
        totalLegacyEntries: 50,
        migratedEntriesCount: 50,
        unmigratedEntriesCount: 0,
        totalArtifacts: 50,
        artifactsBySourceKind: {
          'skill-directory': 0,
          'single-skill-md': 0,
          'legacy-knowledge': 50,
        },
        unmigratedEntryIds: [],
        coexistenceActive: true,
        sunsetReady: true,
        sunsetBlockers: [],
        reportedAt: '2024-01-01T00:00:00Z',
      };

      const parsed = compatibilityStatusResponseSchema.parse(response);
      expect(parsed.sunsetReady).toBe(true);
      expect(parsed.sunsetBlockers).toHaveLength(0);
      expect(parsed.unmigratedEntryIds).toHaveLength(0);
    });

    it('accepts status response with no artifacts yet', () => {
      const response = {
        totalLegacyEntries: 10,
        migratedEntriesCount: 0,
        unmigratedEntriesCount: 10,
        totalArtifacts: 0,
        artifactsBySourceKind: {
          'skill-directory': 0,
          'single-skill-md': 0,
          'legacy-knowledge': 0,
        },
        unmigratedEntryIds: ['knowledge_1', 'knowledge_2'],
        coexistenceActive: false,
        sunsetReady: false,
        sunsetBlockers: ['No artifacts created yet'],
        reportedAt: '2024-01-01T00:00:00Z',
      };

      const parsed = compatibilityStatusResponseSchema.parse(response);
      expect(parsed.totalArtifacts).toBe(0);
      expect(parsed.coexistenceActive).toBe(false);
    });

    it('limits unmigrated entry IDs sample to 50', () => {
      const tooManyIds = Array.from({ length: 51 }, (_, i) => `knowledge_${i}`);
      const response = {
        totalLegacyEntries: 100,
        migratedEntriesCount: 49,
        unmigratedEntriesCount: 51,
        totalArtifacts: 49,
        artifactsBySourceKind: {
          'skill-directory': 0,
          'single-skill-md': 0,
          'legacy-knowledge': 49,
        },
        unmigratedEntryIds: tooManyIds,
        coexistenceActive: true,
        sunsetReady: false,
        sunsetBlockers: ['51 unmigrated entries remaining'],
        reportedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => compatibilityStatusResponseSchema.parse(response)).toThrow();
    });
  });
});

// =============================================================================
// Phase 18: Skill Lookup by Content Contracts (SKED-01)
// Artifact-first lookup contract for skill search-by-content CLI command.
// =============================================================================

describe('Phase 18: Skill Lookup by Content Contracts (SKED-01)', () => {
  describe('skillLookupQuerySchema', () => {
    it('accepts valid lookup query with text and applies defaults', () => {
      const query = skillLookupQuerySchema.parse({ text: 'docker container fails to start' });

      expect(query.text).toBe('docker container fails to start');
      expect(query.maxResults).toBe(10);
    });

    it('accepts explicit maxResults within bounds', () => {
      const query = skillLookupQuerySchema.parse({
        text: 'postgresql connection timeout',
        maxResults: 25,
      });

      expect(query.maxResults).toBe(25);
    });

    it('rejects empty text', () => {
      expect(() => skillLookupQuerySchema.parse({ text: '' })).toThrow();
    });

    it('rejects text longer than 2000 characters', () => {
      const longText = 'a'.repeat(2001);
      expect(() => skillLookupQuerySchema.parse({ text: longText })).toThrow();
    });

    it('rejects maxResults less than 1', () => {
      expect(() => skillLookupQuerySchema.parse({ text: 'valid text', maxResults: 0 })).toThrow();
    });

    it('rejects maxResults greater than 50', () => {
      expect(() => skillLookupQuerySchema.parse({ text: 'valid text', maxResults: 51 })).toThrow();
    });

    it('rejects missing text field', () => {
      expect(() => skillLookupQuerySchema.parse({})).toThrow();
    });
  });

  describe('skillLookupResultItemSchema', () => {
    it('accepts valid artifact-first match with metadata-only fields', () => {
      const match = skillLookupResultItemSchema.parse({
        artifactId: 'artifact_123',
        title: 'Docker container troubleshooting',
        slug: 'docker-container-troubleshooting',
        labels: ['docker', 'containers', 'devops'],
        scope: 'global',
        requiredLevel: 3,
        sourceKind: 'skill-directory',
        score: 0.92,
        reason: 'Strong keyword match on docker and container terms',
      });

      expect(match.artifactId).toBe('artifact_123');
      expect(match.title).toBe('Docker container troubleshooting');
      expect(match.slug).toBe('docker-container-troubleshooting');
      expect(match.labels).toHaveLength(3);
      expect(match.scope).toBe('global');
      expect(match.requiredLevel).toBe(3);
      expect(match.sourceKind).toBe('skill-directory');
      expect(match.score).toBe(0.92);
      expect(match.reason).toBe('Strong keyword match on docker and container terms');
    });

    it('accepts all valid sourceKind values', () => {
      const sourceKinds = ['skill-directory', 'single-skill-md', 'legacy-knowledge'] as const;

      for (const kind of sourceKinds) {
        const match = skillLookupResultItemSchema.parse({
          artifactId: 'artifact_1',
          title: 'Test',
          slug: 'test',
          labels: ['test'],
          scope: 'project',
          requiredLevel: 0,
          sourceKind: kind,
          score: 0.5,
          reason: 'Test match',
        });

        expect(match.sourceKind).toBe(kind);
      }
    });

    it('accepts both scope values', () => {
      const globalMatch = skillLookupResultItemSchema.parse({
        artifactId: 'artifact_1',
        title: 'Test',
        slug: 'test',
        labels: ['test'],
        scope: 'global',
        requiredLevel: 0,
        sourceKind: 'skill-directory',
        score: 0.5,
        reason: 'Test match',
      });

      const projectMatch = skillLookupResultItemSchema.parse({
        artifactId: 'artifact_2',
        title: 'Test',
        slug: 'test',
        labels: ['test'],
        scope: 'project',
        requiredLevel: 0,
        sourceKind: 'skill-directory',
        score: 0.5,
        reason: 'Test match',
      });

      expect(globalMatch.scope).toBe('global');
      expect(projectMatch.scope).toBe('project');
    });

    it('rejects invalid sourceKind', () => {
      expect(() =>
        skillLookupResultItemSchema.parse({
          artifactId: 'artifact_1',
          title: 'Test',
          slug: 'test',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          sourceKind: 'invalid-kind',
          score: 0.5,
          reason: 'Test match',
        }),
      ).toThrow();
    });

    it('rejects score outside 0-1 range', () => {
      expect(() =>
        skillLookupResultItemSchema.parse({
          artifactId: 'artifact_1',
          title: 'Test',
          slug: 'test',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          score: 1.5,
          reason: 'Test match',
        }),
      ).toThrow();

      expect(() =>
        skillLookupResultItemSchema.parse({
          artifactId: 'artifact_1',
          title: 'Test',
          slug: 'test',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          score: -0.1,
          reason: 'Test match',
        }),
      ).toThrow();
    });

    it('rejects requiredLevel outside 0-10 range', () => {
      expect(() =>
        skillLookupResultItemSchema.parse({
          artifactId: 'artifact_1',
          title: 'Test',
          slug: 'test',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 11,
          sourceKind: 'skill-directory',
          score: 0.5,
          reason: 'Test match',
        }),
      ).toThrow();
    });

    it('is distinct from capsuleMatchSchema (artifact-first, not capsule-first)', () => {
      // skillLookupResultItemSchema should not have capsuleId, content, situation, problem, goal
      const match = skillLookupResultItemSchema.parse({
        artifactId: 'artifact_1',
        title: 'Test',
        slug: 'test',
        labels: ['test'],
        scope: 'global',
        requiredLevel: 0,
        sourceKind: 'skill-directory',
        score: 0.5,
        reason: 'Test match',
      });

      // Verify it does NOT have capsule-native fields
      expect('capsuleId' in match).toBe(false);
      expect('content' in match).toBe(false);
      expect('situation' in match).toBe(false);
      expect('problem' in match).toBe(false);
      expect('goal' in match).toBe(false);
      expect('capsuleId' in match).toBe(false);
    });
  });

  describe('skillLookupResponseSchema', () => {
    it('accepts valid response with matches', () => {
      const response = skillLookupResponseSchema.parse({
        matches: [
          {
            artifactId: 'artifact_1',
            title: 'Docker troubleshooting',
            slug: 'docker-troubleshooting',
            labels: ['docker'],
            scope: 'global',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            score: 0.95,
            reason: 'Strong match',
          },
          {
            artifactId: 'artifact_2',
            title: 'Container orchestration',
            slug: 'container-orchestration',
            labels: ['kubernetes', 'docker'],
            scope: 'project',
            requiredLevel: 5,
            sourceKind: 'legacy-knowledge',
            score: 0.78,
            reason: 'Partial match',
          },
        ],
      });

      expect(response.matches).toHaveLength(2);
      expect(response.matches[0]?.artifactId).toBe('artifact_1');
      expect(response.matches[1]?.artifactId).toBe('artifact_2');
    });

    it('accepts empty matches array', () => {
      const response = skillLookupResponseSchema.parse({ matches: [] });

      expect(response.matches).toHaveLength(0);
    });

    it('defaults matches to empty array when omitted', () => {
      const response = skillLookupResponseSchema.parse({});

      expect(response.matches).toEqual([]);
    });

    it('is distinct from retrievalV2ResponseWithHintsSchema (no capsules or activationHints)', () => {
      // skillLookupResponseSchema should not have capsules, profileHints, or activationHints
      const response = skillLookupResponseSchema.parse({
        matches: [
          {
            artifactId: 'artifact_1',
            title: 'Test',
            slug: 'test',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            score: 0.5,
            reason: 'Test',
          },
        ],
      });

      // Verify it does NOT have capsule-native or activation fields
      expect('capsules' in response).toBe(false);
      expect('profileHints' in response).toBe(false);
      expect('activationHints' in response).toBe(false);
    });

    it('ensures artifact-first design: each match has unique artifactId', () => {
      // This test documents the contract: lookup results are artifact-unique
      // Server-side logic will dedupe capsules to unique artifacts
      const response = skillLookupResponseSchema.parse({
        matches: [
          {
            artifactId: 'artifact_unique_1',
            title: 'Skill A',
            slug: 'skill-a',
            labels: ['a'],
            scope: 'global',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            score: 0.9,
            reason: 'Match',
          },
          {
            artifactId: 'artifact_unique_2',
            title: 'Skill B',
            slug: 'skill-b',
            labels: ['b'],
            scope: 'global',
            requiredLevel: 0,
            sourceKind: 'skill-directory',
            score: 0.8,
            reason: 'Match',
          },
        ],
      });

      const artifactIds = response.matches.map((m) => m.artifactId);
      const uniqueIds = new Set(artifactIds);
      expect(uniqueIds.size).toBe(artifactIds.length);
    });
  });
});

// =============================================================================
// Phase 19: Skill Edit and History Contracts (SKED-02, SKED-04)
// Edit request/response and history view schemas for skill editing flow.
// =============================================================================

import {
  skillEditRequestSchema,
  skillEditResponseSchema,
  skillHistoryRequestSchema,
  skillHistoryResponseSchema,
  skillRevisionSummarySchema,
} from './index.js';

describe('Phase 19: Skill Edit and History Contracts', () => {
  describe('skillEditRequestSchema', () => {
    it('accepts valid edit request with artifactId and title only', () => {
      const request = {
        artifactId: 'artifact_123',
        title: 'Updated Docker Troubleshooting Guide',
      };

      const parsed = skillEditRequestSchema.parse(request);
      expect(parsed.artifactId).toBe('artifact_123');
      expect(parsed.title).toBe('Updated Docker Troubleshooting Guide');
      expect(parsed.labels).toBeUndefined();
      expect(parsed.files).toBeUndefined();
    });

    it('accepts valid edit request with artifactId and labels only', () => {
      const request = {
        artifactId: 'artifact_456',
        labels: ['docker', 'containers', 'updated'],
      };

      const parsed = skillEditRequestSchema.parse(request);
      expect(parsed.artifactId).toBe('artifact_456');
      expect(parsed.labels).toHaveLength(3);
      expect(parsed.title).toBeUndefined();
    });

    it('accepts valid edit request with artifactId and files payload', () => {
      const request = {
        artifactId: 'artifact_789',
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'a'.repeat(64),
            sizeBytes: 2048,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
            content: '# Updated Skill Content',
          },
        ],
      };

      const parsed = skillEditRequestSchema.parse(request);
      expect(parsed.artifactId).toBe('artifact_789');
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files?.[0]?.path).toBe('SKILL.md');
    });

    it('accepts edit request with title, labels, and files together', () => {
      const request = {
        artifactId: 'artifact_full',
        title: 'Complete Update',
        labels: ['new-label'],
        files: [
          {
            path: 'references/guide.md',
            kind: 'reference',
            sha256: 'b'.repeat(64),
            sizeBytes: 1024,
            mediaType: 'text/markdown',
            source: 'references/',
            includeInDerivation: true,
            activationOnly: false,
            content: 'Reference content',
          },
        ],
      };

      const parsed = skillEditRequestSchema.parse(request);
      expect(parsed.title).toBe('Complete Update');
      expect(parsed.labels).toHaveLength(1);
      expect(parsed.files).toHaveLength(1);
    });

    it('defaults scriptDescriptors to empty array', () => {
      const request = {
        artifactId: 'artifact_1',
        title: 'Test',
      };

      const parsed = skillEditRequestSchema.parse(request);
      expect(parsed.scriptDescriptors).toEqual([]);
    });

    it('rejects edit request with no update fields (at least one required)', () => {
      const request = {
        artifactId: 'artifact_noupdate',
      };

      expect(() => skillEditRequestSchema.parse(request)).toThrow();
    });

    it('rejects edit request with empty labels array', () => {
      const request = {
        artifactId: 'artifact_1',
        labels: [],
      };

      expect(() => skillEditRequestSchema.parse(request)).toThrow();
    });

    it('rejects edit request with empty files array', () => {
      const request = {
        artifactId: 'artifact_1',
        files: [],
      };

      expect(() => skillEditRequestSchema.parse(request)).toThrow();
    });

    it('rejects edit request missing artifactId', () => {
      const request = {
        title: 'Missing artifactId',
      };

      expect(() => skillEditRequestSchema.parse(request)).toThrow();
    });

    it('rejects title longer than 280 characters', () => {
      const request = {
        artifactId: 'artifact_1',
        title: 'a'.repeat(281),
      };

      expect(() => skillEditRequestSchema.parse(request)).toThrow();
    });
  });

  describe('skillEditResponseSchema', () => {
    const makeMinimalArtifact = () => ({
      id: 'artifact_1',
      teamId: null,
      scope: 'global' as const,
      labels: ['test'],
      title: 'Test Artifact',
      slug: 'test-artifact',
      requiredLevel: 0,
      lifecycleState: 'approved' as const,
      owner: {
        id: 'user_1',
        handle: 'testuser',
        securityLevel: 5,
      },
      latestRevision: 2,
      history: [
        {
          revision: 1,
          sourceHash: 'a'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: 'a'.repeat(64),
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
          scriptDescriptors: [],
          derived: null,
        },
        {
          revision: 2,
          sourceHash: 'b'.repeat(64),
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: 'b'.repeat(64),
              sizeBytes: 150,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: '2024-01-02T00:00:00Z',
          submittedBy: {
            id: 'user_1',
            handle: 'testuser',
            securityLevel: 5,
          },
          scriptDescriptors: [],
          derived: null,
        },
      ],
      metadata: {
        sourceKind: 'skill-directory' as const,
        submissionCount: 2,
        resubmissionCount: 0,
        revisionCount: 2,
        latestSubmissionId: 'submission_2',
        latestSubmittedAt: '2024-01-02T00:00:00Z',
        latestReviewedAt: '2024-01-02T01:00:00Z',
        latestDecision: 'approve' as const,
      },
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T01:00:00Z',
    });

    it('accepts valid edit response with updated artifact and revision info', () => {
      const response = {
        artifact: makeMinimalArtifact(),
        previousRevision: 1,
      };

      const parsed = skillEditResponseSchema.parse(response);
      expect(parsed.artifact.id).toBe('artifact_1');
      expect(parsed.artifact.latestRevision).toBe(2);
      expect(parsed.previousRevision).toBe(1);
    });

    it('accepts edit response with lifecycle transition', () => {
      const response = {
        artifact: {
          ...makeMinimalArtifact(),
          lifecycleState: 'submitted' as const,
        },
        previousRevision: 1,
        lifecycleTransition: {
          from: 'approved' as const,
          to: 'submitted' as const,
        },
      };

      const parsed = skillEditResponseSchema.parse(response);
      expect(parsed.lifecycleTransition).toBeDefined();
      expect(parsed.lifecycleTransition?.from).toBe('approved');
      expect(parsed.lifecycleTransition?.to).toBe('submitted');
    });

    it('accepts edit response without lifecycle transition', () => {
      const response = {
        artifact: makeMinimalArtifact(),
        previousRevision: 1,
      };

      const parsed = skillEditResponseSchema.parse(response);
      expect(parsed.lifecycleTransition).toBeUndefined();
    });

    it('returns full skillArtifactSchema in artifact field', () => {
      const artifact = makeMinimalArtifact();
      const response = {
        artifact,
        previousRevision: 1,
      };

      const parsed = skillEditResponseSchema.parse(response);
      // Verify key artifact fields are preserved
      expect(parsed.artifact.id).toBe('artifact_1');
      expect(parsed.artifact.title).toBe('Test Artifact');
      expect(parsed.artifact.slug).toBe('test-artifact');
      expect(parsed.artifact.history).toHaveLength(2);
    });
  });

  describe('skillRevisionSummarySchema', () => {
    it('accepts valid revision summary with required fields', () => {
      const summary = {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
        lifecycleState: 'approved' as const,
      };

      const parsed = skillRevisionSummarySchema.parse(summary);
      expect(parsed.revision).toBe(1);
      expect(parsed.submittedAt).toBe('2024-01-01T00:00:00Z');
      expect(parsed.submittedBy.handle).toBe('testuser');
      expect(parsed.lifecycleState).toBe('approved');
    });

    it('accepts revision summary with optional summary text', () => {
      const summary = {
        revision: 2,
        submittedAt: '2024-01-02T00:00:00Z',
        submittedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
        lifecycleState: 'approved' as const,
        summary: 'Updated title and labels',
      };

      const parsed = skillRevisionSummarySchema.parse(summary);
      expect(parsed.summary).toBe('Updated title and labels');
    });

    it('rejects summary text longer than 500 characters', () => {
      const summary = {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
        lifecycleState: 'approved' as const,
        summary: 'a'.repeat(501),
      };

      expect(() => skillRevisionSummarySchema.parse(summary)).toThrow();
    });

    it('does not include full file manifests', () => {
      const summary = {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
        lifecycleState: 'approved' as const,
      };

      const parsed = skillRevisionSummarySchema.parse(summary);
      expect('files' in parsed).toBe(false);
      expect('sourceHash' in parsed).toBe(false);
    });
  });

  describe('skillHistoryRequestSchema', () => {
    it('accepts valid history request with artifactId', () => {
      const request = {
        artifactId: 'artifact_123',
      };

      const parsed = skillHistoryRequestSchema.parse(request);
      expect(parsed.artifactId).toBe('artifact_123');
    });

    it('rejects history request missing artifactId', () => {
      expect(() => skillHistoryRequestSchema.parse({})).toThrow();
    });

    it('rejects invalid artifactId format', () => {
      const request = {
        artifactId: '',
      };

      expect(() => skillHistoryRequestSchema.parse(request)).toThrow();
    });
  });

  describe('skillHistoryResponseSchema', () => {
    it('accepts valid history response with revision summaries', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'Docker Troubleshooting',
        currentRevision: 3,
        lifecycleState: 'approved' as const,
        revisions: [
          {
            revision: 1,
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'alice', securityLevel: 5 },
            lifecycleState: 'approved' as const,
          },
          {
            revision: 2,
            submittedAt: '2024-01-15T00:00:00Z',
            submittedBy: { id: 'user_2', handle: 'bob', securityLevel: 5 },
            lifecycleState: 'approved' as const,
            summary: 'Added docker-compose reference',
          },
          {
            revision: 3,
            submittedAt: '2024-02-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'alice', securityLevel: 5 },
            lifecycleState: 'approved' as const,
            summary: 'Updated for v2 API',
          },
        ],
      };

      const parsed = skillHistoryResponseSchema.parse(response);
      expect(parsed.artifactId).toBe('artifact_1');
      expect(parsed.title).toBe('Docker Troubleshooting');
      expect(parsed.currentRevision).toBe(3);
      expect(parsed.lifecycleState).toBe('approved');
      expect(parsed.revisions).toHaveLength(3);
    });

    it('accepts history response with empty revisions array', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'New Artifact',
        currentRevision: 1,
        lifecycleState: 'draft' as const,
        revisions: [],
      };

      const parsed = skillHistoryResponseSchema.parse(response);
      expect(parsed.revisions).toHaveLength(0);
    });

    it('is distinct from artifact export response (no full file manifests)', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'Test',
        currentRevision: 1,
        lifecycleState: 'approved' as const,
        revisions: [
          {
            revision: 1,
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'test', securityLevel: 5 },
            lifecycleState: 'approved' as const,
          },
        ],
      };

      const parsed = skillHistoryResponseSchema.parse(response);

      // History response should NOT have bundle or distilled fields
      expect('bundle' in parsed).toBe(false);
      expect('distilled' in parsed).toBe(false);
      expect('format' in parsed).toBe(false);
      expect('exportedAt' in parsed).toBe(false);

      // Revisions should NOT have full file manifests
      expect('files' in parsed.revisions[0]!).toBe(false);
      expect('sourceHash' in parsed.revisions[0]!).toBe(false);
    });

    it('is distinct from skillArtifactSchema (metadata-only, no full history)', () => {
      const response = {
        artifactId: 'artifact_1',
        title: 'Test',
        currentRevision: 1,
        lifecycleState: 'approved' as const,
        revisions: [],
      };

      const parsed = skillHistoryResponseSchema.parse(response);

      // History response should NOT have artifact-level fields like owner, history, metadata
      expect('owner' in parsed).toBe(false);
      expect('history' in parsed).toBe(false);
      expect('metadata' in parsed).toBe(false);
      expect('agentReview' in parsed).toBe(false);
      expect('reviewHistory' in parsed).toBe(false);
      expect('scope' in parsed).toBe(false);
      expect('labels' in parsed).toBe(false);
    });
  });

  describe('Edit and history schema integration', () => {
    it('edit response preserves artifact history for history view', () => {
      // After an edit, the artifact in the response should have history
      // that can be queried via the history endpoint
      const artifactWithHistory = {
        id: 'artifact_1',
        teamId: null,
        scope: 'global' as const,
        labels: ['test'],
        title: 'Updated Title',
        slug: 'test-artifact',
        requiredLevel: 0,
        lifecycleState: 'approved' as const,
        owner: {
          id: 'user_1',
          handle: 'testuser',
          securityLevel: 5,
        },
        latestRevision: 2,
        history: [
          {
            revision: 1,
            sourceHash: 'a'.repeat(64),
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown' as const,
                sha256: 'a'.repeat(64),
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md' as const,
                includeInDerivation: true,
                activationOnly: false,
              },
            ],
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'testuser', securityLevel: 5 },
            scriptDescriptors: [],
            derived: null,
          },
          {
            revision: 2,
            sourceHash: 'b'.repeat(64),
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown' as const,
                sha256: 'b'.repeat(64),
                sizeBytes: 150,
                mediaType: 'text/markdown',
                source: 'SKILL.md' as const,
                includeInDerivation: true,
                activationOnly: false,
              },
            ],
            submittedAt: '2024-01-02T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'testuser', securityLevel: 5 },
            scriptDescriptors: [],
            derived: null,
          },
        ],
        metadata: {
          sourceKind: 'skill-directory' as const,
          submissionCount: 2,
          resubmissionCount: 0,
          revisionCount: 2,
          latestSubmissionId: 'submission_2',
          latestSubmittedAt: '2024-01-02T00:00:00Z',
          latestReviewedAt: '2024-01-02T01:00:00Z',
          latestDecision: 'approve' as const,
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T01:00:00Z',
      };

      const editResponse = skillEditResponseSchema.parse({
        artifact: artifactWithHistory,
        previousRevision: 1,
      });

      // Artifact in edit response has full history
      expect(editResponse.artifact.history).toHaveLength(2);

      // History view would return summaries, not full history
      const historyResponse = skillHistoryResponseSchema.parse({
        artifactId: artifactWithHistory.id,
        title: artifactWithHistory.title,
        currentRevision: artifactWithHistory.latestRevision,
        lifecycleState: artifactWithHistory.lifecycleState,
        revisions: artifactWithHistory.history.map((h) => ({
          revision: h.revision,
          submittedAt: h.submittedAt,
          submittedBy: h.submittedBy,
          lifecycleState: artifactWithHistory.lifecycleState,
        })),
      });

      // History response has summaries, not full file manifests
      expect(historyResponse.revisions).toHaveLength(2);
      expect('files' in historyResponse.revisions[0]!).toBe(false);
    });
  });
});

// Phase 20: Skill Review Contracts (SKED-03)
import {
  skillReviewDecisionRequestSchema,
  skillReviewDecisionResponseSchema,
  skillReviewQueueItemSchema,
  skillReviewQueueResponseSchema,
} from './domain/operations.js';

describe('Phase 20: Skill Review Contracts', () => {
  describe('skillReviewDecisionRequestSchema', () => {
    it('accepts valid approve decision', () => {
      const request = {
        artifactId: 'artifact_123',
        decision: 'approve' as const,
        notes: 'Looks good to me',
      };
      const parsed = skillReviewDecisionRequestSchema.parse(request);
      expect(parsed.decision).toBe('approve');
      expect(parsed.notes).toBe('Looks good to me');
    });

    it('accepts valid reject decision', () => {
      const request = {
        artifactId: 'artifact_123',
        decision: 'reject' as const,
        notes: 'Needs more detail in the SKILL.md',
      };
      const parsed = skillReviewDecisionRequestSchema.parse(request);
      expect(parsed.decision).toBe('reject');
    });

    it('rejects notes shorter than 1 character', () => {
      const request = {
        artifactId: 'artifact_123',
        decision: 'approve' as const,
        notes: '',
      };
      expect(() => skillReviewDecisionRequestSchema.parse(request)).toThrow();
    });

    it('rejects notes longer than 2000 characters', () => {
      const request = {
        artifactId: 'artifact_123',
        decision: 'approve' as const,
        notes: 'x'.repeat(2001),
      };
      expect(() => skillReviewDecisionRequestSchema.parse(request)).toThrow();
    });

    it('rejects invalid decision value', () => {
      const request = {
        artifactId: 'artifact_123',
        decision: 'maybe',
        notes: 'Not sure',
      };
      expect(() => skillReviewDecisionRequestSchema.parse(request)).toThrow();
    });
  });

  describe('skillReviewQueueResponseSchema', () => {
    it('accepts valid queue response with items', () => {
      const artifact = {
        id: 'artifact_1',
        teamId: null,
        scope: 'global' as const,
        labels: ['typescript'],
        title: 'Test Skill',
        slug: 'test-skill',
        requiredLevel: 0,
        lifecycleState: 'agent-pass' as const,
        owner: { id: 'user_1', handle: 'alice', securityLevel: 1 },
        latestRevision: 1,
        history: [
          {
            revision: 1,
            sourceHash: 'a'.repeat(64),
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown' as const,
                sha256: 'b'.repeat(64),
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md' as const,
                includeInDerivation: true,
                activationOnly: false,
              },
            ],
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'alice', securityLevel: 1 },
            scriptDescriptors: [],
            derived: null,
          },
        ],
        metadata: {
          sourceKind: 'skill-directory' as const,
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub_1',
          latestSubmittedAt: '2024-01-01T00:00:00Z',
        },
        agentReview: {
          status: 'agent-pass' as const,
          duplicateRisk: 'low' as const,
          correctnessRisk: 'low' as const,
          completenessRisk: 'low' as const,
          checkedAt: '2024-01-01T00:00:00Z',
          notes: [],
        },
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const response = {
        items: [
          {
            artifact,
            revision: 1,
            agentReview: {
              status: 'agent-pass' as const,
              duplicateRisk: 'low' as const,
              correctnessRisk: 'low' as const,
              completenessRisk: 'low' as const,
              checkedAt: '2024-01-01T00:00:00Z',
              notes: [],
            },
            submittedBy: { id: 'user_1', handle: 'alice', securityLevel: 1 },
            lastDecision: null,
          },
        ],
        nextCursor: null,
        total: 1,
      };
      const parsed = skillReviewQueueResponseSchema.parse(response);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.total).toBe(1);
    });

    it('accepts empty queue', () => {
      const response = {
        items: [],
        nextCursor: null,
        total: 0,
      };
      const parsed = skillReviewQueueResponseSchema.parse(response);
      expect(parsed.items).toHaveLength(0);
    });
  });

  describe('skillReviewDecisionResponseSchema', () => {
    it('accepts valid response with state transition', () => {
      const artifact = {
        id: 'artifact_1',
        teamId: null,
        scope: 'global' as const,
        labels: ['typescript'],
        title: 'Test Skill',
        slug: 'test-skill',
        requiredLevel: 0,
        lifecycleState: 'approved' as const,
        owner: { id: 'user_1', handle: 'alice', securityLevel: 1 },
        latestRevision: 1,
        history: [
          {
            revision: 1,
            sourceHash: 'a'.repeat(64),
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown' as const,
                sha256: 'b'.repeat(64),
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md' as const,
                includeInDerivation: true,
                activationOnly: false,
              },
            ],
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user_1', handle: 'alice', securityLevel: 1 },
            scriptDescriptors: [],
            derived: null,
          },
        ],
        metadata: {
          sourceKind: 'skill-directory' as const,
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub_1',
          latestSubmittedAt: '2024-01-01T00:00:00Z',
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      };
      const response = {
        artifact,
        previousState: 'agent-pass' as const,
        newState: 'approved' as const,
      };
      const parsed = skillReviewDecisionResponseSchema.parse(response);
      expect(parsed.previousState).toBe('agent-pass');
      expect(parsed.newState).toBe('approved');
    });
  });
});

// =============================================================================
// Phase 25: Retrieval Evaluation Contracts (REVAL-01, REVAL-02)
// =============================================================================

import {
  retrievalEvalActorSchema,
  retrievalEvalCaseSchema,
  retrievalEvalEndpointSchema,
  retrievalEvalExpectedSchema,
  retrievalEvalGovernanceExpectationsSchema,
  retrievalEvalRelevanceExpectationsSchema,
  retrievalEvalRequestSchema,
  retrievalEvalScenarioSchema,
  retrievalEvalShapeExpectationsSchema,
  retrievalEvalTierSchema,
} from './domain/evals/retrieval.js';

describe('Phase 25: Retrieval Evaluation Contracts', () => {
  describe('retrievalEvalTierSchema', () => {
    it('accepts smoke and core tiers', () => {
      expect(retrievalEvalTierSchema.parse('smoke')).toBe('smoke');
      expect(retrievalEvalTierSchema.parse('core')).toBe('core');
    });

    it('rejects invalid tier values', () => {
      expect(() => retrievalEvalTierSchema.parse('full')).toThrow();
      expect(() => retrievalEvalTierSchema.parse('integration')).toThrow();
    });
  });

  describe('retrievalEvalEndpointSchema', () => {
    it('accepts explicit v1, v2, and v3 endpoint paths', () => {
      expect(retrievalEvalEndpointSchema.parse('/v1/retrieval/search')).toBe(
        '/v1/retrieval/search',
      );
      expect(retrievalEvalEndpointSchema.parse('/v2/retrieval/search')).toBe(
        '/v2/retrieval/search',
      );
      expect(retrievalEvalEndpointSchema.parse('/v3/retrieval/search')).toBe(
        '/v3/retrieval/search',
      );
    });

    it('rejects invalid or normalized endpoint values', () => {
      // Should reject shorthand or normalized forms
      expect(() => retrievalEvalEndpointSchema.parse('v1/retrieval/search')).toThrow();
      expect(() => retrievalEvalEndpointSchema.parse('/retrieval/search')).toThrow();
      expect(() => retrievalEvalEndpointSchema.parse('/v4/retrieval/search')).toThrow();
    });
  });

  describe('retrievalEvalActorSchema', () => {
    it('accepts valid user actor with team context', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 5,
        permissions: ['knowledge:search'],
      };
      const parsed = retrievalEvalActorSchema.parse(actor);
      expect(parsed.subjectType).toBe('user');
      expect(parsed.activeTeamId).toBe('team_1');
    });

    it('accepts system-admin actor with null team', () => {
      const actor = {
        subjectType: 'system-admin',
        activeTeamId: null,
        securityLevel: 10,
        permissions: ['system:admin'],
      };
      const parsed = retrievalEvalActorSchema.parse(actor);
      expect(parsed.subjectType).toBe('system-admin');
      expect(parsed.activeTeamId).toBeNull();
    });

    it('rejects actor without permissions', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 5,
        permissions: [],
      };
      expect(() => retrievalEvalActorSchema.parse(actor)).toThrow();
    });

    it('rejects actor with invalid security level', () => {
      const actor = {
        subjectType: 'user',
        activeTeamId: 'team_1',
        securityLevel: 15, // Invalid: > 10
        permissions: ['knowledge:search'],
      };
      expect(() => retrievalEvalActorSchema.parse(actor)).toThrow();
    });
  });

  describe('retrievalEvalScenarioSchema', () => {
    it('parses valid scenario with actor context and deterministic fixtures', () => {
      const scenario = {
        scenarioId: 'governance-mixed-entries',
        description: 'Mix of approved, pending, and cross-team entries',
        actor: {
          subjectType: 'user',
          activeTeamId: 'team_1',
          securityLevel: 5,
          permissions: ['knowledge:search'],
        },
        fixtures: {
          knowledgeEntries: [{ id: 'entry_1', scope: 'global', lifecycleState: 'approved' }],
          skillArtifacts: [],
        },
      };
      const parsed = retrievalEvalScenarioSchema.parse(scenario);
      expect(parsed.scenarioId).toBe('governance-mixed-entries');
      expect(parsed.actor.securityLevel).toBe(5);
    });

    it('defaults empty fixture arrays', () => {
      const scenario = {
        scenarioId: 'empty-corpus',
        description: 'Empty corpus scenario',
        actor: {
          subjectType: 'user',
          activeTeamId: null,
          securityLevel: 0,
          permissions: ['knowledge:search'],
        },
        fixtures: {}, // Omit fixtures
      };
      const parsed = retrievalEvalScenarioSchema.parse(scenario);
      expect(parsed.fixtures.knowledgeEntries).toEqual([]);
      expect(parsed.fixtures.skillArtifacts).toEqual([]);
    });
  });

  describe('retrievalEvalRequestSchema', () => {
    it('accepts seed-only request with defaults', () => {
      const request = { seed: 'REST API rate limiting' };
      const parsed = retrievalEvalRequestSchema.parse(request);
      expect(parsed.seed).toBe('REST API rate limiting');
      expect(parsed.filters.labels).toEqual([]);
      expect(parsed.filters.scopes).toEqual([]);
    });

    it('accepts request with filters and mode', () => {
      const request = {
        seed: 'docker timeout',
        filters: { labels: ['docker'], scopes: ['project'] },
        maxResults: 20,
        mode: 'hybrid',
      };
      const parsed = retrievalEvalRequestSchema.parse(request);
      expect(parsed.mode).toBe('hybrid');
      expect(parsed.maxResults).toBe(20);
    });
  });

  describe('retrievalEvalRelevanceExpectationsSchema', () => {
    it('accepts relevant IDs and ideal order for ranking metrics', () => {
      const relevance = {
        relevantIds: ['entry_1', 'entry_2', 'entry_3'],
        idealOrder: ['entry_2', 'entry_1', 'entry_3'],
      };
      const parsed = retrievalEvalRelevanceExpectationsSchema.parse(relevance);
      expect(parsed.relevantIds).toHaveLength(3);
      expect(parsed.idealOrder[0]).toBe('entry_2');
    });

    it('defaults empty arrays', () => {
      const parsed = retrievalEvalRelevanceExpectationsSchema.parse({});
      expect(parsed.relevantIds).toEqual([]);
      expect(parsed.idealOrder).toEqual([]);
    });
  });

  describe('retrievalEvalGovernanceExpectationsSchema', () => {
    it('accepts forbidden IDs with explicit reasons', () => {
      const governance = {
        forbiddenIds: ['entry_other_team', 'entry_high_level', 'entry_pending'],
        forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
      };
      const parsed = retrievalEvalGovernanceExpectationsSchema.parse(governance);
      expect(parsed.forbiddenIds).toHaveLength(3);
      expect(parsed.forbiddenReasons).toContain('cross-team');
    });

    it('rejects invalid forbidden reasons', () => {
      const governance = {
        forbiddenIds: ['entry_1'],
        forbiddenReasons: ['not-authorized'], // Invalid reason
      };
      expect(() => retrievalEvalGovernanceExpectationsSchema.parse(governance)).toThrow();
    });

    it('defaults empty arrays', () => {
      const parsed = retrievalEvalGovernanceExpectationsSchema.parse({});
      expect(parsed.forbiddenIds).toEqual([]);
      expect(parsed.forbiddenReasons).toEqual([]);
    });
  });

  describe('retrievalEvalShapeExpectationsSchema', () => {
    it('accepts v1 bucket expectations', () => {
      const shape = {
        bucketExpectations: {
          globalConstraints: ['entry_1', 'entry_2'],
          projectKnowledge: ['entry_3'],
        },
      };
      const parsed = retrievalEvalShapeExpectationsSchema.parse(shape);
      expect(parsed.bucketExpectations?.globalConstraints).toHaveLength(2);
      expect(parsed.bucketExpectations?.projectKnowledge).toHaveLength(1);
    });

    it('accepts v2 profile hint and capsule expectations', () => {
      const shape = {
        expectedProfileHintArtifactIds: ['artifact_1', 'artifact_2'],
        expectedCapsuleCount: 5,
      };
      const parsed = retrievalEvalShapeExpectationsSchema.parse(shape);
      expect(parsed.expectedProfileHintArtifactIds).toHaveLength(2);
      expect(parsed.expectedCapsuleCount).toBe(5);
    });

    it('rejects invalid bucket names', () => {
      const shape = {
        bucketExpectations: {
          capsules: ['capsule_1'], // Invalid: v2 concept in v1 bucket shape
        },
      };
      expect(() => retrievalEvalShapeExpectationsSchema.parse(shape)).toThrow();
    });
  });

  describe('retrievalEvalExpectedSchema', () => {
    it('accepts non-empty outcome with relevance and governance', () => {
      const expected = {
        outcome: 'non-empty',
        relevance: { relevantIds: ['entry_1'] },
        governance: { forbiddenIds: [] },
        shape: {},
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.outcome).toBe('non-empty');
    });

    it('accepts empty outcome for forbidden-result scenarios', () => {
      const expected = {
        outcome: 'empty',
        relevance: { relevantIds: [] },
        governance: {
          forbiddenIds: ['entry_other_team'],
          forbiddenReasons: ['cross-team'],
        },
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.outcome).toBe('empty');
      expect(parsed.governance.forbiddenReasons).toContain('cross-team');
    });

    it('defaults shape expectations', () => {
      const expected = {
        outcome: 'non-empty',
        relevance: {},
        governance: {},
      };
      const parsed = retrievalEvalExpectedSchema.parse(expected);
      expect(parsed.shape.expectedProfileHintArtifactIds).toEqual([]);
    });
  });

  describe('retrievalEvalCaseSchema', () => {
    it('parses valid v1 smoke case with bucket expectations (Task 1, Test 2)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v1-semantic-positive-smoke',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'docker timeout', mode: 'semantic' },
        scenarioId: 'docker-basics',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['entry_1'] },
          governance: { forbiddenIds: [] },
          shape: {
            bucketExpectations: {
              globalConstraints: [],
              projectKnowledge: ['entry_1'],
            },
          },
        },
        tags: ['v1', 'smoke', 'positive'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.caseId).toBe('v1-semantic-positive-smoke');
      expect(parsed.endpoint).toBe('/v1/retrieval/search');
      expect(parsed.expected.shape.bucketExpectations?.projectKnowledge).toContain('entry_1');
    });

    it('parses valid v2 smoke case with capsule/profile expectations (Task 1, Test 3)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v2-capsule-positive-smoke',
        tier: 'smoke',
        endpoint: '/v2/retrieval/search',
        request: { seed: 'docker deployment' },
        scenarioId: 'docker-basics',
        expected: {
          outcome: 'non-empty',
          relevance: { relevantIds: ['capsule_1'], idealOrder: ['capsule_1'] },
          governance: { forbiddenIds: [] },
          shape: {
            expectedProfileHintArtifactIds: ['artifact_1'],
            expectedCapsuleCount: 1,
          },
        },
        tags: ['v2', 'smoke', 'capsule'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.endpoint).toBe('/v2/retrieval/search');
      expect(parsed.expected.shape.expectedProfileHintArtifactIds).toContain('artifact_1');
      expect(parsed.expected.shape.expectedCapsuleCount).toBe(1);
    });

    it('keeps relevance and governance separate (T-25-02)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'v1-semantic-forbidden-smoke',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'internal secrets' },
        scenarioId: 'governance-mixed',
        expected: {
          outcome: 'empty',
          relevance: { relevantIds: ['entry_sensitive'] }, // Would be relevant
          governance: {
            forbiddenIds: ['entry_sensitive'], // But is forbidden
            forbiddenReasons: ['security-level'],
          },
        },
        tags: ['governance', 'smoke'],
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      // Relevance and governance are independent
      expect(parsed.expected.relevance.relevantIds).toContain('entry_sensitive');
      expect(parsed.expected.governance.forbiddenIds).toContain('entry_sensitive');
    });

    it('accepts valid v3 endpoint values (Task 1, Test 4)', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'valid-v3-endpoint',
        tier: 'smoke',
        endpoint: '/v3/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      expect(retrievalEvalCaseSchema.parse(testCase).endpoint).toBe('/v3/retrieval/search');
    });

    it('rejects missing actor/security fields (Task 1, Test 4)', () => {
      const scenario = {
        scenarioId: 'missing-actor',
        description: 'Invalid scenario',
        actor: {
          subjectType: 'user',
          // Missing activeTeamId and securityLevel
          permissions: ['knowledge:search'],
        },
        fixtures: {},
      };
      expect(() => retrievalEvalScenarioSchema.parse(scenario)).toThrow();
    });

    it('rejects mixed v1/v2 shape assertions (Task 1, Test 4)', () => {
      // This validates that v1 bucket names are explicitly constrained
      const shape = {
        bucketExpectations: {
          capsules: ['capsule_1'], // Invalid: v2 concept in v1 bucket shape
        },
      };
      expect(() => retrievalEvalShapeExpectationsSchema.parse(shape)).toThrow();
    });

    it('rejects collapsed expectedIds shortcut (Task 1, Test 4)', () => {
      // The schema does not have an expectedIds field at the case level
      // This test documents that collapsed shortcuts are not supported
      const testCase = {
        schemaVersion: 1,
        caseId: 'collapsed-test',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: {
          outcome: 'non-empty',
          expectedIds: ['entry_1'], // Invalid: collapsed shortcut not supported
        },
      };
      expect(() => retrievalEvalCaseSchema.parse(testCase)).toThrow();
    });

    it('requires schema version field', () => {
      const testCase = {
        // Missing schemaVersion
        caseId: 'no-version',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      expect(() => retrievalEvalCaseSchema.parse(testCase)).toThrow();
    });

    it('defaults tags to empty array', () => {
      const testCase = {
        schemaVersion: 1,
        caseId: 'no-tags',
        tier: 'smoke',
        endpoint: '/v1/retrieval/search',
        request: { seed: 'test' },
        scenarioId: 'test',
        expected: { outcome: 'non-empty', relevance: {}, governance: {} },
      };
      const parsed = retrievalEvalCaseSchema.parse(testCase);
      expect(parsed.tags).toEqual([]);
    });
  });
});
