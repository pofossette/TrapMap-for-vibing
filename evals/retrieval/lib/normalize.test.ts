/**
 * Tests for endpoint response normalization.
 *
 * Task 2: Test v1 and v2 responses normalize into a shared comparable result structure while retaining endpoint-specific diagnostics.
 *
 * Phase 26-01: REVAL-01
 */

import { describe, expect, it } from 'vitest';

import type { RetrievalResponse, RetrievalV2ResponseWithHints } from '../../../packages/contracts/src/index.js';
import {
  extractV1Ids,
  extractV2CapsuleIds,
  extractV2ProfileHintArtifactIds,
  normalizeResponse,
  normalizeV1Response,
  normalizeV2Response,
} from './normalize.js';

describe('normalize', () => {
  describe('normalizeV1Response', () => {
    it('normalizes v1 bucketed response into shared result shape', () => {
      const response: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry_global_1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Global Constraint',
            detail: 'A global constraint',
            labels: ['constraint'],
            score: 0.8,
            reason: 'High semantic match',
          },
        ],
        projectKnowledge: [
          {
            entryId: 'entry_project_1',
            scope: 'project',
            requiredLevel: 3,
            shortcut: 'Project Knowledge',
            detail: 'Project-specific knowledge',
            labels: ['project'],
            score: 0.9,
            reason: 'Best match',
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV1Response(response);

      // Check shared shape
      expect(result.hits).toHaveLength(2);
      expect(result.returnedIds).toHaveLength(2);
      expect(result.isEmpty).toBe(false);
      expect(result.endpoint).toBe('/v1/retrieval/search');

      // Check sorting by score descending
      expect(result.hits[0]?.id).toBe('entry_project_1'); // score 0.9
      expect(result.hits[1]?.id).toBe('entry_global_1'); // score 0.8
    });

    it('preserves bucket split in bucket map', () => {
      const response: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry_global_1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Global',
            detail: 'Global',
            labels: [],
            score: 0.7,
            reason: 'Match',
          },
        ],
        projectKnowledge: [
          {
            entryId: 'entry_project_1',
            scope: 'project',
            requiredLevel: 3,
            shortcut: 'Project',
            detail: 'Project',
            labels: [],
            score: 0.8,
            reason: 'Match',
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV1Response(response);

      expect(result.buckets.globalConstraints).toEqual(['entry_global_1']);
      expect(result.buckets.projectKnowledge).toEqual(['entry_project_1']);
    });

    it('has empty profile hint artifact IDs for v1', () => {
      const response: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV1Response(response);

      expect(result.profileHintArtifactIds).toEqual([]);
    });

    it('detects empty result', () => {
      const response: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV1Response(response);

      expect(result.isEmpty).toBe(true);
      expect(result.hits).toEqual([]);
      expect(result.returnedIds).toEqual([]);
    });

    it('retains raw response for diagnostics', () => {
      const response: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: 'No results found',
        summary: null,
      };

      const result = normalizeV1Response(response);

      expect(result.rawResponse).toBe(response);
    });
  });

  describe('normalizeV2Response', () => {
    it('normalizes v2 capsule-first response into shared result shape', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Docker deployment',
            situation: 'Deploying containers',
            problem: 'Complex setup',
            goal: 'Simplify deployment',
            labels: ['docker'],
            scope: 'project',
            requiredLevel: 3,
            score: 0.9,
            reason: 'High match',
          },
          {
            capsuleId: 'capsule_2',
            artifactId: 'artifact_2',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Container networking',
            situation: 'Connecting containers',
            problem: 'Network isolation',
            goal: 'Configure networking',
            labels: ['docker', 'networking'],
            scope: 'global',
            requiredLevel: 3,
            score: 0.75,
            reason: 'Moderate match',
          },
        ],
        profileHints: [
          {
            artifactId: 'artifact_1',
            title: 'Docker Skills',
            slug: 'docker-skills',
            labels: ['docker'],
          },
          {
            artifactId: 'artifact_2',
            title: 'Networking Skills',
            slug: 'networking-skills',
            labels: ['networking'],
          },
        ],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV2Response(response);

      // Check shared shape
      expect(result.hits).toHaveLength(2);
      expect(result.returnedIds).toHaveLength(2);
      expect(result.isEmpty).toBe(false);
      expect(result.endpoint).toBe('/v2/retrieval/search');

      // Check capsule IDs extracted correctly
      expect(result.returnedIds).toContain('capsule_1');
      expect(result.returnedIds).toContain('capsule_2');
    });

    it('preserves profile hint artifact IDs', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [
          {
            artifactId: 'artifact_1',
            title: 'Docker Skills',
            slug: 'docker-skills',
            labels: ['docker'],
          },
        ],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV2Response(response);

      expect(result.profileHintArtifactIds).toEqual(['artifact_1']);
    });

    it('has empty bucket map for v2', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV2Response(response);

      expect(result.buckets.globalConstraints).toEqual([]);
      expect(result.buckets.projectKnowledge).toEqual([]);
    });

    it('detects empty result', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV2Response(response);

      expect(result.isEmpty).toBe(true);
      expect(result.hits).toEqual([]);
      expect(result.returnedIds).toEqual([]);
    });

    it('retains raw response for diagnostics', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [],
        activationHints: [],
        refinementSummary: 'No capsules found',
        summary: null,
      };

      const result = normalizeV2Response(response);

      expect(result.rawResponse).toBe(response);
    });
  });

  describe('normalizeResponse', () => {
    it('dispatches to v1 normalizer for v1 endpoint', () => {
      const response: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry_1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test',
            detail: 'Test',
            labels: [],
            score: 0.9,
            reason: 'Match',
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeResponse(response, '/v1/retrieval/search');

      expect(result.endpoint).toBe('/v1/retrieval/search');
      expect(result.returnedIds).toEqual(['entry_1']);
    });

    it('dispatches to v2 normalizer for v2 endpoint', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Content',
            situation: 'Situation',
            problem: 'Problem',
            goal: 'Goal',
            labels: ['test'],
            scope: 'project',
            requiredLevel: 3,
            score: 0.9,
            reason: 'Match',
          },
        ],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeResponse(response, '/v2/retrieval/search');

      expect(result.endpoint).toBe('/v2/retrieval/search');
      expect(result.returnedIds).toEqual(['capsule_1']);
    });
  });

  describe('extractV1Ids', () => {
    it('extracts all IDs from v1 response', () => {
      const response: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry_global',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Global',
            detail: 'Global',
            labels: [],
            score: 0.8,
            reason: 'Match',
          },
        ],
        projectKnowledge: [
          {
            entryId: 'entry_project',
            scope: 'project',
            requiredLevel: 3,
            shortcut: 'Project',
            detail: 'Project',
            labels: [],
            score: 0.9,
            reason: 'Match',
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      const ids = extractV1Ids(response);

      expect(ids).toContain('entry_global');
      expect(ids).toContain('entry_project');
      expect(ids).toHaveLength(2);
    });
  });

  describe('extractV2CapsuleIds', () => {
    it('extracts capsule IDs from v2 response', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [
          {
            capsuleId: 'capsule_1',
            artifactId: 'artifact_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Content',
            situation: 'S',
            problem: 'P',
            goal: 'G',
            labels: [],
            scope: 'project',
            requiredLevel: 3,
            score: 0.9,
            reason: 'Match',
          },
          {
            capsuleId: 'capsule_2',
            artifactId: 'artifact_2',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Content',
            situation: 'S',
            problem: 'P',
            goal: 'G',
            labels: [],
            scope: 'global',
            requiredLevel: 3,
            score: 0.8,
            reason: 'Match',
          },
        ],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const ids = extractV2CapsuleIds(response);

      expect(ids).toEqual(['capsule_1', 'capsule_2']);
    });
  });

  describe('extractV2ProfileHintArtifactIds', () => {
    it('extracts profile hint artifact IDs from v2 response', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [
          {
            artifactId: 'artifact_1',
            title: 'Skills 1',
            slug: 'skills-1',
            labels: ['test'],
          },
          {
            artifactId: 'artifact_2',
            title: 'Skills 2',
            slug: 'skills-2',
            labels: ['test'],
          },
        ],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const ids = extractV2ProfileHintArtifactIds(response);

      expect(ids).toEqual(['artifact_1', 'artifact_2']);
    });
  });

  describe('endpoint identity preservation', () => {
    it('v1 result preserves endpoint identity', () => {
      const response: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV1Response(response);

      expect(result.endpoint).toBe('/v1/retrieval/search');
    });

    it('v2 result preserves endpoint identity', () => {
      const response: RetrievalV2ResponseWithHints = {
        capsules: [],
        profileHints: [],
        activationHints: [],
        refinementSummary: null,
        summary: null,
      };

      const result = normalizeV2Response(response);

      expect(result.endpoint).toBe('/v2/retrieval/search');
    });
  });
});
