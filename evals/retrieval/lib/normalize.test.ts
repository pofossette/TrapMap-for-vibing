/**
 * Tests for endpoint response normalization.
 *
 * Task 2: Test v1 and v2 responses normalize into a shared comparable result structure while retaining endpoint-specific diagnostics.
 *
 * Phase 26-01: REVAL-01
 */

import { describe, expect, it } from 'vitest';

import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2ResponseWithHints,
} from '@trapmap/contracts';
import {
  extractV1Ids,
  extractV2CapsuleIds,
  extractV2ProfileHintArtifactIds,
  normalizeResponse,
  normalizeV1Response,
  normalizeV2Response,
  normalizeV3Response,
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

  describe('normalizeV3Response', () => {
    it('normalizes selected graph-plan response into shared result shape', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'graph-plan',
          routingReason: 'graph-plan-selected',
          fallbackApplied: false,
          fallbackTarget: null,
          confidenceScore: 0.9,
          confidenceBucket: 'high',
          channelsUsed: ['plan', 'graph', 'capsule'],
        },
        plan: {
          blockingTraps: [],
          recommendedSkills: [
            {
              nodeId: 'skill_node_1',
              artifactId: 'artifact_1',
              capsuleId: 'capsule_1',
              label: 'Docker deployment guide',
              situation: 'Deploying containers',
              problem: 'Deployment drift',
              goal: 'Stabilize rollout',
              scope: 'project',
              requiredLevel: 3,
              score: 0.92,
              activationRefs: {
                references: [],
                assets: [],
                scripts: [],
              },
            },
          ],
          edges: [],
          citations: [],
          graph: {
            nodes: [
              {
                kind: 'skill',
                nodeId: 'skill_node_1',
                artifactId: 'artifact_1',
                capsuleId: 'capsule_1',
                label: 'Docker deployment guide',
                situation: 'Deploying containers',
                problem: 'Deployment drift',
                goal: 'Stabilize rollout',
                scope: 'project',
                requiredLevel: 3,
                score: 0.92,
                activationRefs: {
                  references: [],
                  assets: [],
                  scripts: [],
                },
              },
            ],
            edges: [],
            citations: [],
            focus: {
              blockingTrapNodeIds: [],
              recommendedSkillNodeIds: ['skill_node_1'],
            },
          },
        },
        fallback: null,
      };

      const result = normalizeV3Response(response);

      expect(result.endpoint).toBe('/v3/retrieval/search');
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]?.id).toBe('capsule_1');
      expect(result.profileHintArtifactIds).toEqual(['artifact_1']);
      expect(result.routingTrace?.routingReason).toBe('graph-plan-selected');
      expect(result.routingTrace?.fallbackApplied).toBe(false);
    });

    it('normalizes capsule fallback response into shared result shape', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'capsule',
          routingReason: 'graph-plan-insufficient-trap-evidence',
          fallbackApplied: true,
          fallbackTarget: 'v2-capsule',
          confidenceScore: 0.3,
          confidenceBucket: 'low',
          channelsUsed: ['capsule', 'profile'],
        },
        plan: null,
        fallback: {
          routeFamily: 'capsule',
          response: {
            capsules: [
              {
                capsuleId: 'capsule_fallback_1',
                artifactId: 'artifact_fallback_1',
                revision: 1,
                sourcePaths: ['SKILL.md'],
                content: 'Capsule fallback content',
                situation: 'Need fallback',
                problem: 'Weak graph evidence',
                goal: 'Still return governed capsules',
                labels: ['fallback'],
                scope: 'project',
                requiredLevel: 3,
                score: 0.81,
                reason: 'Fallback capsule',
              },
            ],
            profileHints: [
              {
                artifactId: 'artifact_fallback_1',
                title: 'Fallback Skill',
                slug: 'fallback-skill',
                labels: ['fallback'],
              },
            ],
            activationHints: [],
            refinementSummary: null,
            summary: null,
          },
        },
      };

      const result = normalizeV3Response(response);

      expect(result.endpoint).toBe('/v3/retrieval/search');
      expect(result.returnedIds).toEqual(['capsule_fallback_1']);
      expect(result.profileHintArtifactIds).toEqual(['artifact_fallback_1']);
      expect(result.routingTrace?.fallbackApplied).toBe(true);
      expect(result.routingTrace?.routingReason).toBe('graph-plan-insufficient-trap-evidence');
    });

    it('normalizes entry fallback response into shared result shape', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'entry',
          routingReason: 'graph-plan-insufficient-skill-evidence',
          fallbackApplied: true,
          fallbackTarget: 'v1-graph-assisted',
          confidenceScore: 0.2,
          confidenceBucket: 'low',
          channelsUsed: ['semantic', 'keyword', 'graph'],
        },
        plan: null,
        fallback: {
          routeFamily: 'entry',
          response: {
            globalConstraints: [],
            projectKnowledge: [
              {
                entryId: 'entry_fallback_1',
                scope: 'project',
                requiredLevel: 3,
                shortcut: 'Fallback entry',
                detail: 'Graph-assisted fallback result',
                labels: ['fallback'],
                score: 0.72,
                reason: 'Fallback entry match',
              },
            ],
            refinementSummary: null,
            summary: null,
          },
        },
      };

      const result = normalizeV3Response(response);

      expect(result.endpoint).toBe('/v3/retrieval/search');
      expect(result.returnedIds).toEqual(['entry_fallback_1']);
      expect(result.buckets.projectKnowledge).toEqual(['entry_fallback_1']);
      expect(result.routingTrace?.routingReason).toBe('graph-plan-insufficient-skill-evidence');
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

  describe('normalizeV3Response graph-plan structure', () => {
    it('extracts trap and skill node IDs', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'graph-plan',
          routingReason: 'graph-plan-selected',
          fallbackApplied: false,
          fallbackTarget: null,
          confidenceScore: 0.9,
          confidenceBucket: 'high',
          channelsUsed: ['plan', 'graph'],
        },
        plan: {
          blockingTraps: [],
          recommendedSkills: [],
          edges: [],
          citations: [],
          graph: {
            nodes: [
              {
                kind: 'trap',
                nodeId: 'trap:1',
                sourceId: 'entry_1',
                label: 'Test trap',
                severity: 'hard',
                scope: 'project',
                requiredLevel: 3,
                evidence: 'trap evidence',
                score: 0.9,
              },
              {
                kind: 'skill',
                nodeId: 'skill:1',
                artifactId: 'artifact_1',
                label: 'Test skill',
                situation: 'situation',
                problem: 'problem',
                goal: 'goal',
                scope: 'project',
                requiredLevel: 3,
                score: 0.85,
                activationRefs: { references: [], assets: [], scripts: [] },
              },
              {
                kind: 'skill',
                nodeId: 'skill:2',
                artifactId: 'artifact_2',
                label: 'Test skill 2',
                situation: 'situation',
                problem: 'problem',
                goal: 'goal',
                scope: 'project',
                requiredLevel: 3,
                score: 0.8,
                activationRefs: { references: [], assets: [], scripts: [] },
              },
            ],
            edges: [],
            citations: [],
            focus: {
              blockingTrapNodeIds: ['trap:1'],
              recommendedSkillNodeIds: ['skill:1', 'skill:2'],
            },
          },
        },
        fallback: null,
      };

      const result = normalizeV3Response(response);

      expect(result.graphPlanStructure?.trapNodeIds).toEqual(['trap:1']);
      expect(result.graphPlanStructure?.skillNodeIds).toEqual(['skill:1', 'skill:2']);
    });

    it('extracts edges with type information', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'graph-plan',
          routingReason: 'graph-plan-selected',
          fallbackApplied: false,
          fallbackTarget: null,
          confidenceScore: 0.9,
          confidenceBucket: 'high',
          channelsUsed: ['plan', 'graph'],
        },
        plan: {
          blockingTraps: [],
          recommendedSkills: [],
          edges: [],
          citations: [],
          graph: {
            nodes: [
              {
                kind: 'trap',
                nodeId: 'trap:1',
                sourceId: 'entry_1',
                label: 'Test trap',
                severity: 'hard',
                scope: 'project',
                requiredLevel: 3,
                evidence: 'trap evidence',
                score: 0.9,
              },
              {
                kind: 'skill',
                nodeId: 'skill:1',
                artifactId: 'artifact_1',
                label: 'Test skill',
                situation: 'situation',
                problem: 'problem',
                goal: 'goal',
                scope: 'project',
                requiredLevel: 3,
                score: 0.85,
                activationRefs: { references: [], assets: [], scripts: [] },
              },
            ],
            edges: [
              {
                id: 'edge:1',
                sourceNodeId: 'skill:1',
                targetNodeId: 'trap:1',
                type: 'mitigates',
                strength: 'hard',
              },
            ],
            citations: [],
            focus: {
              blockingTrapNodeIds: ['trap:1'],
              recommendedSkillNodeIds: ['skill:1'],
            },
          },
        },
        fallback: null,
      };

      const result = normalizeV3Response(response);

      expect(result.graphPlanStructure?.edges).toEqual([
        { sourceNodeId: 'skill:1', targetNodeId: 'trap:1', type: 'mitigates' },
      ]);
    });

    it('extracts focus metadata (blocking traps and recommended skills)', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'graph-plan',
          routingReason: 'graph-plan-selected',
          fallbackApplied: false,
          fallbackTarget: null,
          confidenceScore: 0.9,
          confidenceBucket: 'high',
          channelsUsed: ['plan', 'graph'],
        },
        plan: {
          blockingTraps: [],
          recommendedSkills: [],
          edges: [],
          citations: [],
          graph: {
            nodes: [
              {
                kind: 'trap',
                nodeId: 'trap:blocker',
                sourceId: 'entry_1',
                label: 'Blocker',
                severity: 'hard',
                scope: 'project',
                requiredLevel: 3,
                evidence: 'evidence',
                score: 0.9,
              },
              {
                kind: 'skill',
                nodeId: 'skill:recommended',
                artifactId: 'artifact_1',
                label: 'Recommended',
                situation: 's',
                problem: 'p',
                goal: 'g',
                scope: 'project',
                requiredLevel: 3,
                score: 0.85,
                activationRefs: { references: [], assets: [], scripts: [] },
              },
            ],
            edges: [],
            citations: [],
            focus: {
              blockingTrapNodeIds: ['trap:blocker'],
              recommendedSkillNodeIds: ['skill:recommended'],
            },
          },
        },
        fallback: null,
      };

      const result = normalizeV3Response(response);

      expect(result.graphPlanStructure?.blockingTrapNodeIds).toEqual(['trap:blocker']);
      expect(result.graphPlanStructure?.recommendedSkillNodeIds).toEqual(['skill:recommended']);
    });

    it('returns undefined graphPlanStructure for fallback responses', () => {
      const response: GraphPlanSearchResponse = {
        routingTrace: {
          selectedMode: 'mix',
          routeFamily: 'capsule',
          routingReason: 'graph-plan-insufficient-trap-evidence',
          fallbackApplied: true,
          fallbackTarget: 'v2-capsule',
          confidenceScore: 0.3,
          confidenceBucket: 'low',
          channelsUsed: ['capsule'],
        },
        plan: null,
        fallback: {
          routeFamily: 'capsule',
          response: {
            capsules: [],
            profileHints: [],
            activationHints: [],
            refinementSummary: null,
            summary: null,
          },
        },
      };

      const result = normalizeV3Response(response);

      expect(result.graphPlanStructure).toBeUndefined();
    });
  });
});
