/**
 * Tests for capsule-first response assembly.
 *
 * Task 2: Pure capsule-first assembly and summary shaping
 * - Test 1: assembly groups distilled capsule results into stable response sections without exposing raw file bodies
 * - Test 2: match reasons and citations remain derivable from filtered capsule hits
 * - Test 3: summary generation only consumes already-filtered distilled hits and returns null when citations are absent
 *
 * Phase 15: Activation hint shaping (Task 2)
 * - Test 1: matched artifacts with clientManifest surface read-next hints and activation metadata
 * - Test 2: retrieval responses still exclude raw file bodies and activation-only payload content
 * - Test 3: route and integration tests prove the /v2/retrieval/search path validates and returns the enriched contract
 */

import { describe, expect, it } from 'vitest';

import type { CapsuleMatch, ProfileHint, RetrievalSummary } from '@trapmap/contracts';
import { capsuleMatchSchema, profileHintSchema } from '@trapmap/contracts';
import type { ClientManifestRecord, SkillArtifactRecord } from '../../store.js';
import type { CapsuleCandidate, ScoredEntry } from '../types.js';
import {
  buildActivationHints,
  buildAllActivationHints,
  buildAssetHint,
  buildCapsuleMatch,
  buildProfileHint,
  buildReadNextHint,
  buildScriptHint,
  buildV2RetrievalResponse,
  toRetrievalMatch,
} from './assembly.js';

describe('assembly', () => {
  describe('toRetrievalMatch', () => {
    it('includes boundaryExplanation when present on ScoredEntry (BOUND-05)', () => {
      const mockEntry = {
        id: 'test-1',
        scope: 'global',
        requiredLevel: 0,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        boundary: {
          context: ['production'],
          versions: [],
          prerequisites: [],
          signals: [],
          exclusions: [],
          evidence: [],
        },
      };

      const scoredEntry: ScoredEntry = {
        entry: mockEntry as any,
        score: 0.8,
        boundaryExplanation: {
          checked: true,
          requiredSatisfied: true,
          warnings: [],
          boosts: ['Applicable context: production'],
        },
      };

      const match = toRetrievalMatch(scoredEntry, { labels: [], scopes: [] });

      expect(match.boundaryExplanation).toBeDefined();
      expect(match.boundaryExplanation?.checked).toBe(true);
      expect(match.boundaryExplanation?.boosts).toContain('Applicable context: production');
    });

    it('omits boundaryExplanation when not present on ScoredEntry', () => {
      const mockEntry = {
        id: 'test-1',
        scope: 'global',
        requiredLevel: 0,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
      };

      const scoredEntry: ScoredEntry = {
        entry: mockEntry as any,
        score: 0.8,
      };

      const match = toRetrievalMatch(scoredEntry, { labels: [], scopes: [] });

      expect(match.boundaryExplanation).toBeUndefined();
    });

    it('includes conflicts when provided', () => {
      const mockEntry = {
        id: 'test-1',
        scope: 'global',
        requiredLevel: 0,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
      };

      const scoredEntry: ScoredEntry = {
        entry: mockEntry as any,
        score: 0.8,
      };

      const conflicts = [
        {
          entryId: 'conflict-1',
          shortcut: 'alternative-solution',
          conflictType: 'alternative' as const,
          context: 'Different approach to the same problem',
        },
      ];

      const match = toRetrievalMatch(scoredEntry, { labels: [], scopes: [] }, undefined, conflicts);

      expect(match.conflicts).toBeDefined();
      expect(match.conflicts).toHaveLength(1);
    });
  });

  describe('buildCapsuleMatch', () => {
    it('creates capsule match from capsule record without exposing raw file bodies', () => {
      const capsule = {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        sourcePaths: ['SKILL.md', 'references/docker.md'],
        content: 'Use docker-compose for multi-container setups',
        situation: 'Deploying multiple containers',
        problem: 'Manual networking is error-prone',
        goal: 'Simplify deployment with compose',
        labels: ['docker', 'compose'],
        scope: 'project',
        requiredLevel: 3,
      };

      const candidate: CapsuleCandidate = {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        situationScore: 0.8,
        problemScore: 0.9,
        goalScore: 0.7,
        stackPathBoost: 1.0,
        finalScore: 0.85,
        reason: 'High match on problem and situation',
      };

      const match = buildCapsuleMatch(capsule, candidate);

      expect(match.capsuleId).toBe('capsule_1');
      expect(match.artifactId).toBe('artifact_1');
      expect(match.content).toBe('Use docker-compose for multi-container setups');
      expect(match.score).toBe(0.85);
      expect(match.reason).toBe('High match on problem and situation');
      // Verify no raw file bodies are exposed
      expect(match).not.toHaveProperty('rawFileContents');
      expect(match).not.toHaveProperty('bundlePayloads');
    });

    it('capsule match validates against contract schema', () => {
      const capsule = {
        capsuleId: 'capsule_2',
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
      };

      const candidate: CapsuleCandidate = {
        capsuleId: 'capsule_2',
        artifactId: 'artifact_1',
        revision: 1,
        situationScore: 0.5,
        problemScore: 0.6,
        goalScore: 0.4,
        stackPathBoost: 1.2,
        finalScore: 0.65,
        reason: 'Moderate match',
      };

      const match = buildCapsuleMatch(capsule, candidate);

      // Should parse successfully against contract schema
      const parsed = capsuleMatchSchema.parse(match);
      expect(parsed.capsuleId).toBe('capsule_2');
      expect(parsed.score).toBe(0.65);
    });
  });

  describe('buildProfileHint', () => {
    it('creates lightweight profile hint from artifact metadata', () => {
      const artifact = {
        id: 'artifact_1',
        title: 'Docker Deployment Skills',
        slug: 'docker-deployment',
        labels: ['docker', 'deployment'],
      };

      const hint = buildProfileHint(artifact);

      expect(hint.artifactId).toBe('artifact_1');
      expect(hint.title).toBe('Docker Deployment Skills');
      expect(hint.slug).toBe('docker-deployment');
      expect(hint.labels).toEqual(['docker', 'deployment']);
    });

    it('profile hint validates against contract schema', () => {
      const artifact = {
        id: 'artifact_2',
        title: 'Test Skills',
        slug: 'test-skills',
        labels: ['test'],
      };

      const hint = buildProfileHint(artifact);

      const parsed = profileHintSchema.parse(hint);
      expect(parsed.artifactId).toBe('artifact_2');
    });
  });

  describe('buildV2RetrievalResponse', () => {
    it('groups distilled capsule results into stable response sections', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'First capsule',
          situation: 'Situation 1',
          problem: 'Problem 1',
          goal: 'Goal 1',
          labels: ['docker'],
          scope: 'project',
          requiredLevel: 2,
          score: 0.9,
          reason: 'High match',
        },
        {
          capsuleId: 'capsule_2',
          artifactId: 'artifact_2',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Second capsule',
          situation: 'Situation 2',
          problem: 'Problem 2',
          goal: 'Goal 2',
          labels: ['typescript'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.75,
          reason: 'Moderate match',
        },
      ];

      const profileHints: ProfileHint[] = [
        {
          artifactId: 'artifact_1',
          title: 'Docker Skills',
          slug: 'docker-skills',
          labels: ['docker'],
        },
      ];

      const response = buildV2RetrievalResponse(capsules, profileHints);

      expect(response.capsules).toHaveLength(2);
      expect(response.profileHints).toHaveLength(1);
      expect(response.capsules[0]?.score).toBe(0.9);
      expect(response.capsules[1]?.score).toBe(0.75);
    });

    it('response does not expose raw file bodies', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md', 'references/docker.md'],
          content: 'Distilled content only',
          situation: 'Test',
          problem: 'Test',
          goal: 'Test',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.8,
          reason: 'Match',
        },
      ];

      const response = buildV2RetrievalResponse(capsules, []);

      // No raw file content fields
      expect(response).not.toHaveProperty('rawFileBodies');
      expect(response).not.toHaveProperty('bundleContents');
      expect(response.capsules[0]?.content).toBe('Distilled content only');
    });

    it('accepts optional summary over filtered capsule hits', () => {
      const capsules: CapsuleMatch[] = [
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
          score: 0.8,
          reason: 'Match',
        },
      ];

      const summary: RetrievalSummary = {
        text: 'Summary of filtered results',
        citations: [
          {
            source: {
              entryId: 'capsule_1',
              scope: 'global',
              shortcut: 'Test',
            },
            snippet: 'Test content',
            tags: ['test'],
            recallChannels: ['semantic'],
            scores: {
              semantic: 0.8,
              keyword: null,
              graph: null,
              preRerank: 0.8,
              final: 0.8,
            },
          },
        ],
      };

      const response = buildV2RetrievalResponse(capsules, [], summary);

      expect(response.summary).not.toBeNull();
      expect(response.summary?.text).toBe('Summary of filtered results');
    });

    it('returns null summary when no summary provided', () => {
      const response = buildV2RetrievalResponse([], []);

      expect(response.summary).toBeNull();
    });
  });

  describe('T-14-07: No bundle payloads in response', () => {
    it('assembly never includes raw bundle file contents', () => {
      const capsule = {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        sourcePaths: ['SKILL.md', 'assets/config.yml', 'scripts/setup.sh'],
        content: 'Distilled knowledge from skill',
        situation: 'Setting up project',
        problem: 'Configuration complexity',
        goal: 'Simplify setup',
        labels: ['setup'],
        scope: 'project',
        requiredLevel: 2,
      };

      const candidate: CapsuleCandidate = {
        capsuleId: 'capsule_1',
        artifactId: 'artifact_1',
        revision: 1,
        situationScore: 0.8,
        problemScore: 0.9,
        goalScore: 0.7,
        stackPathBoost: 1.0,
        finalScore: 0.8,
        reason: 'Match',
      };

      const match = buildCapsuleMatch(capsule, candidate);

      // Source paths are included but not contents
      expect(match.sourcePaths).toContain('assets/config.yml');
      expect(match.sourcePaths).toContain('scripts/setup.sh');
      // But no asset/script bodies
      expect(match.content).toBe('Distilled knowledge from skill');
      expect(match).not.toHaveProperty('assetContents');
      expect(match).not.toHaveProperty('scriptContents');
    });
  });
});

// =============================================================================
// Phase 15: Activation hint shaping tests (Task 2)
// RETR-05, ACTV-01: Metadata-only activation hints from governed clientManifest
// =============================================================================

describe('Phase 15: Activation hints', () => {
  const mockManifest: ClientManifestRecord = {
    artifactId: 'artifact_1',
    revision: 1,
    references: [
      {
        path: 'references/docker-guide.md',
        sha256: 'a'.repeat(64),
        sizeBytes: 2048,
        mediaType: 'text/markdown',
      },
    ],
    assets: [
      {
        path: 'assets/docker-compose.yaml',
        sha256: 'b'.repeat(64),
        sizeBytes: 1024,
        mediaType: 'application/yaml',
      },
    ],
    scripts: [
      {
        path: 'scripts/deploy.sh',
        sha256: 'c'.repeat(64),
        capability: 'Deploy to production',
        argsSchemaSummary: 'env: string',
        sideEffectSummary: 'Pushes to remote server',
        defaultPolicy: 'manual',
      },
    ],
    sourceHash: 'd'.repeat(64),
  };

  const mockCapsule: CapsuleMatch = {
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
    reason: 'High match',
  };

  describe('buildReadNextHint', () => {
    it('builds read-next hint from manifest reference (Task 2, Test 1)', () => {
      const ref = mockManifest.references[0]!;
      const hint = buildReadNextHint('artifact_1', 1, ref);

      expect(hint.artifactId).toBe('artifact_1');
      expect(hint.revision).toBe(1);
      expect(hint.path).toBe('references/docker-guide.md');
      expect(hint.sha256).toBe('a'.repeat(64));
    });

    it('read-next hint is metadata-only without file content (Task 2, Test 2, T-15-01)', () => {
      const ref = mockManifest.references[0]!;
      const hint = buildReadNextHint('artifact_1', 1, ref);

      expect(hint).not.toHaveProperty('content');
      expect(hint).not.toHaveProperty('body');
    });
  });

  describe('buildAssetHint', () => {
    it('builds asset hint from manifest asset (Task 2, Test 1)', () => {
      const asset = mockManifest.assets[0]!;
      const hint = buildAssetHint('artifact_1', 1, asset);

      expect(hint.artifactId).toBe('artifact_1');
      expect(hint.path).toBe('assets/docker-compose.yaml');
      expect(hint.sizeBytes).toBe(1024);
      expect(hint.mediaType).toBe('application/yaml');
    });

    it('asset hint is metadata-only without file body (Task 2, Test 2, T-15-01)', () => {
      const asset = mockManifest.assets[0]!;
      const hint = buildAssetHint('artifact_1', 1, asset);

      expect(hint).not.toHaveProperty('content');
      expect(hint).not.toHaveProperty('data');
      expect(hint).not.toHaveProperty('body');
    });
  });

  describe('buildScriptHint', () => {
    it('builds script hint from manifest script (Task 2, Test 1)', () => {
      const script = mockManifest.scripts[0]!;
      const hint = buildScriptHint('artifact_1', 1, script);

      expect(hint.artifactId).toBe('artifact_1');
      expect(hint.path).toBe('scripts/deploy.sh');
      expect(hint.capability).toBe('Deploy to production');
      expect(hint.defaultPolicy).toBe('needs-approval');
    });

    it('script hint is metadata-only without script body (Task 2, Test 2, T-15-01, T-15-03)', () => {
      const script = mockManifest.scripts[0]!;
      const hint = buildScriptHint('artifact_1', 1, script);

      expect(hint).not.toHaveProperty('scriptBody');
      expect(hint).not.toHaveProperty('content');
      expect(hint).not.toHaveProperty('code');
    });
  });

  describe('buildActivationHints', () => {
    it('builds activation hints from capsule and manifest (Task 2, Test 1)', () => {
      const hints = buildActivationHints(mockCapsule, mockManifest);

      expect(hints.capsuleId).toBe('capsule_1');
      expect(hints.readNext).toHaveLength(1);
      expect(hints.assets).toHaveLength(1);
      expect(hints.scripts).toHaveLength(1);
    });

    it('returns empty hints when manifest is null', () => {
      const hints = buildActivationHints(mockCapsule, null);

      expect(hints.capsuleId).toBe('capsule_1');
      expect(hints.readNext).toEqual([]);
      expect(hints.assets).toEqual([]);
      expect(hints.scripts).toEqual([]);
    });

    it('all hints are metadata-only without file bodies (Task 2, Test 2)', () => {
      const hints = buildActivationHints(mockCapsule, mockManifest);

      // Check read-next hints have no content
      expect(hints.readNext[0]).not.toHaveProperty('content');

      // Check asset hints have no body
      expect(hints.assets[0]).not.toHaveProperty('content');

      // Check script hints have no script body
      expect(hints.scripts[0]).not.toHaveProperty('scriptBody');
    });
  });

  describe('buildAllActivationHints', () => {
    it('builds hints for all capsules from artifacts (Task 2, Test 1)', () => {
      const mockArtifact: SkillArtifactRecord = {
        id: 'artifact_1',
        teamId: null,
        scope: 'project',
        labels: ['docker'],
        title: 'Docker Skills',
        slug: 'docker-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        owner: {
          actorType: 'user',
          id: 'user_1',
          handle: 'testuser',
        },
        latestRevision: {
          revision: 1,
          sourceHash: 'd'.repeat(64),
          files: [],
          submittedAt: '2024-01-01T00:00:00Z',
          submittedByUserId: 'user_1',
          scriptDescriptors: [],
          derived: {
            profile: null,
            capsules: [],
            clientManifest: mockManifest,
            sourceHash: 'd'.repeat(64),
            derivedAt: '2024-01-01T00:00:00Z',
          },
        },
        history: [],
        metadata: {
          sourceKind: 'skill-directory',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub_1',
          latestSubmittedAt: '2024-01-01T00:00:00Z',
          latestReviewedAt: null,
          latestDecision: null,
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const hints = buildAllActivationHints([mockCapsule], [mockArtifact]);

      expect(hints).toHaveLength(1);
      expect(hints[0]?.capsuleId).toBe('capsule_1');
      expect(hints[0]?.readNext).toHaveLength(1);
    });

    it('returns empty hints for capsules whose artifacts have no manifest', () => {
      const mockArtifactNoManifest: SkillArtifactRecord = {
        id: 'artifact_1',
        teamId: null,
        scope: 'project',
        labels: ['docker'],
        title: 'Docker Skills',
        slug: 'docker-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        owner: {
          actorType: 'user',
          id: 'user_1',
          handle: 'testuser',
        },
        latestRevision: {
          revision: 1,
          sourceHash: 'd'.repeat(64),
          files: [],
          submittedAt: '2024-01-01T00:00:00Z',
          submittedByUserId: 'user_1',
          scriptDescriptors: [],
          derived: null, // No derived outputs
        },
        history: [],
        metadata: {
          sourceKind: 'skill-directory',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub_1',
          latestSubmittedAt: '2024-01-01T00:00:00Z',
          latestReviewedAt: null,
          latestDecision: null,
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const hints = buildAllActivationHints([mockCapsule], [mockArtifactNoManifest]);

      expect(hints).toHaveLength(1);
      expect(hints[0]?.readNext).toEqual([]);
      expect(hints[0]?.assets).toEqual([]);
      expect(hints[0]?.scripts).toEqual([]);
    });

    it('sources hints only from governed clientManifest (T-15-02)', () => {
      // This test verifies that hints come from manifest, not from ad-hoc sources
      const hints = buildActivationHints(mockCapsule, mockManifest);

      // All hints should reference the manifest's artifact and revision
      for (const ref of hints.readNext) {
        expect(ref.artifactId).toBe(mockManifest.artifactId);
        expect(ref.revision).toBe(mockManifest.revision);
      }
      for (const asset of hints.assets) {
        expect(asset.artifactId).toBe(mockManifest.artifactId);
        expect(asset.revision).toBe(mockManifest.revision);
      }
      for (const script of hints.scripts) {
        expect(script.artifactId).toBe(mockManifest.artifactId);
        expect(script.revision).toBe(mockManifest.revision);
      }
    });
  });

  describe('T-15-01: No file bodies in activation hints', () => {
    it('activation hints never include file content', () => {
      const hints = buildActivationHints(mockCapsule, mockManifest);

      // Validate JSON serialization doesn't include content fields
      const serialized = JSON.stringify(hints);
      expect(serialized).not.toContain('"content"');
      expect(serialized).not.toContain('"body"');
      expect(serialized).not.toContain('"scriptBody"');
    });
  });
});
