/**
 * Tests for capsule-first response assembly.
 *
 * Task 2: Pure capsule-first assembly and summary shaping
 * - Test 1: assembly groups distilled capsule results into stable response sections without exposing raw file bodies
 * - Test 2: match reasons and citations remain derivable from filtered capsule hits
 * - Test 3: summary generation only consumes already-filtered distilled hits and returns null when citations are absent
 */

import { describe, expect, it } from 'vitest';

import type { CapsuleMatch, ProfileHint, RetrievalCitation, RetrievalSummary } from '@skill-shareer/contracts';
import { capsuleMatchSchema, profileHintSchema } from '@skill-shareer/contracts';
import { buildV2RetrievalResponse, buildCapsuleMatch, buildProfileHint, buildActivationHint } from './assembly.js';
import type { CapsuleCandidate } from './types.js';
import type { ClientManifestRecord } from '../store.js';

describe('assembly', () => {
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

  // Phase 15: Activation hint assembly tests (RETR-05, ACTV-01)
  describe('Phase 15: Activation hint assembly', () => {
    it('builds activation hints from clientManifest metadata', () => {
      const clientManifest: ClientManifestRecord = {
        artifactId: 'artifact_1',
        revision: 1,
        references: [
          {
            path: 'references/docker-compose.md',
            sha256: 'a'.repeat(64),
            sizeBytes: 1024,
            mediaType: 'text/markdown',
          },
        ],
        assets: [
          {
            path: 'assets/docker-compose.yml',
            sha256: 'b'.repeat(64),
            sizeBytes: 512,
            mediaType: 'text/x-yaml',
          },
        ],
        scripts: [
          {
            path: 'scripts/deploy.sh',
            sha256: 'c'.repeat(64),
            capability: 'Deploy containers',
            argsSchemaSummary: 'env: string',
            sideEffectSummary: 'Creates containers',
            defaultPolicy: 'manual',
          },
        ],
        sourceHash: 'd'.repeat(64),
      };

      const activationHint = buildActivationHint(clientManifest);

      expect(activationHint.artifactId).toBe('artifact_1');
      expect(activationHint.readNextReferences).toHaveLength(1);
      expect(activationHint.readNextReferences[0]?.path).toBe('references/docker-compose.md');
      expect(activationHint.availableAssets).toHaveLength(1);
      expect(activationHint.availableAssets[0]?.path).toBe('assets/docker-compose.yml');
      expect(activationHint.availableScripts).toHaveLength(1);
      expect(activationHint.availableScripts[0]?.capability).toBe('Deploy containers');
    });

    it('builds empty activation hints when clientManifest has no content', () => {
      const emptyManifest: ClientManifestRecord = {
        artifactId: 'artifact_2',
        revision: 1,
        references: [],
        assets: [],
        scripts: [],
        sourceHash: 'e'.repeat(64),
      };

      const activationHint = buildActivationHint(emptyManifest);

      expect(activationHint.artifactId).toBe('artifact_2');
      expect(activationHint.readNextReferences).toHaveLength(0);
      expect(activationHint.availableAssets).toHaveLength(0);
      expect(activationHint.availableScripts).toHaveLength(0);
    });

    it('activation hints do not include file content or script bodies', () => {
      const clientManifest: ClientManifestRecord = {
        artifactId: 'artifact_1',
        revision: 1,
        references: [
          {
            path: 'references/test.md',
            sha256: 'f'.repeat(64),
            sizeBytes: 2048,
            mediaType: 'text/markdown',
          },
        ],
        assets: [],
        scripts: [
          {
            path: 'scripts/test.sh',
            sha256: 'g'.repeat(64),
            capability: 'Test capability',
            argsSchemaSummary: '',
            sideEffectSummary: '',
            defaultPolicy: 'manual',
          },
        ],
        sourceHash: 'h'.repeat(64),
      };

      const activationHint = buildActivationHint(clientManifest);

      // Verify metadata-only - no content fields
      expect(activationHint.readNextReferences[0]).not.toHaveProperty('content');
      expect(activationHint.readNextReferences[0]).not.toHaveProperty('body');
      expect(activationHint.availableScripts[0]).not.toHaveProperty('scriptBody');
      expect(activationHint.availableScripts[0]).not.toHaveProperty('code');
    });

    it('v2 response assembly includes activation hints when provided', () => {
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

      const profileHints: ProfileHint[] = [];

      const activationHints = [
        {
          artifactId: 'artifact_1',
          readNextReferences: [
            {
              path: 'references/test.md',
              sha256: 'i'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/markdown',
            },
          ],
          availableAssets: [],
          availableScripts: [],
        },
      ];

      const response = buildV2RetrievalResponse(capsules, profileHints, undefined, activationHints);

      expect(response.capsules).toHaveLength(1);
      expect(response.activationHints).toHaveLength(1);
      expect(response.activationHints?.[0]?.readNextReferences).toHaveLength(1);
    });

    it('v2 response assembly omits activation hints when not provided', () => {
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

      const profileHints: ProfileHint[] = [];

      const response = buildV2RetrievalResponse(capsules, profileHints);

      expect(response.capsules).toHaveLength(1);
      expect(response.activationHints).toBeUndefined();
    });
  });
});
