import { describe, it, expect } from 'vitest';
import {
  graphPlanEdgeTypeSchema,
  graphPlanSchema,
  graphPlanSkillActivationRefsSchema,
  graphPlanNodeSchema,
  planEdgeTypeSchema,
  planEdgeStrengthSchema,
  planTrapNodeSchema,
  planSkillNodeSchema,
  planEdgeSchema,
  planCitationSchema,
  trapFirstPlanSchema,
  planQuerySchema,
} from './plans.js';

describe('plans schema contracts', () => {
  describe('planEdgeTypeSchema', () => {
    it('accepts valid plan edge types', () => {
      expect(planEdgeTypeSchema.parse('risk-blocks')).toBe('risk-blocks');
      expect(planEdgeTypeSchema.parse('mitigates')).toBe('mitigates');
      expect(planEdgeTypeSchema.parse('requires')).toBe('requires');
      expect(planEdgeTypeSchema.parse('order')).toBe('order');
    });

    it('rejects invalid plan edge types like co-occurs-with', () => {
      expect(() => planEdgeTypeSchema.parse('co-occurs-with')).toThrow();
    });
  });

  describe('planEdgeStrengthSchema', () => {
    it('accepts hard and soft', () => {
      expect(planEdgeStrengthSchema.parse('hard')).toBe('hard');
      expect(planEdgeStrengthSchema.parse('soft')).toBe('soft');
    });
  });

  describe('planTrapNodeSchema', () => {
    it('requires nodeId, sourceId, label, severity, scope, requiredLevel, evidence, score', () => {
      const trap = planTrapNodeSchema.parse({
        nodeId: 'trap:entry-1',
        sourceId: 'entry-1',
        label: 'Memory corruption on concurrent access',
        severity: 'hard',
        scope: 'global',
        requiredLevel: 5,
        evidence: 'Pattern of concurrent modification without locking detected in module X',
        score: 0.92,
      });

      expect(trap.nodeId).toBe('trap:entry-1');
      expect(trap.severity).toBe('hard');
      expect(trap.scope).toBe('global');
      expect(trap.requiredLevel).toBe(5);
    });

    it('rejects missing governance fields', () => {
      expect(() =>
        planTrapNodeSchema.parse({
          nodeId: 'trap:entry-1',
          sourceId: 'entry-1',
          label: 'Test',
          severity: 'hard',
          // missing scope, requiredLevel, evidence, score
        }),
      ).toThrow();
    });
  });

  describe('planSkillNodeSchema', () => {
    it('requires situation, problem, goal fields matching capsule structure', () => {
      const skill = planSkillNodeSchema.parse({
        nodeId: 'skill:art-1',
        artifactId: 'art-1',
        capsuleId: 'cap-1',
        label: 'Use connection pooling',
        situation: 'Database connections are expensive to create',
        problem: 'Creating a new connection per query causes latency spikes',
        goal: 'Reuse connections from a shared pool',
        scope: 'project',
        requiredLevel: 3,
        score: 0.85,
      });

      expect(skill.situation).toBe('Database connections are expensive to create');
      expect(skill.problem).toBe('Creating a new connection per query causes latency spikes');
      expect(skill.goal).toBe('Reuse connections from a shared pool');
      expect(skill.scope).toBe('project');
      expect(skill.requiredLevel).toBe(3);
      expect(skill.activationRefs).toEqual({ references: [], assets: [], scripts: [] });
    });

    it('allows optional capsuleId', () => {
      const skill = planSkillNodeSchema.parse({
        nodeId: 'skill:art-2',
        artifactId: 'art-2',
        label: 'Rate limit API calls',
        situation: 'Unbounded API calls',
        problem: 'Server overload',
        goal: 'Enforce rate limits',
        scope: 'global',
        requiredLevel: 0,
        score: 0.7,
      });

      expect(skill.capsuleId).toBeUndefined();
      expect(skill.activationRefs.references).toEqual([]);
    });
  });

  describe('graphPlanEdgeTypeSchema', () => {
    it('accepts additive graph-only edge types', () => {
      expect(graphPlanEdgeTypeSchema.parse('co-occurs-with')).toBe('co-occurs-with');
    });
  });

  describe('graphPlanSkillActivationRefsSchema', () => {
    it('defaults to empty metadata-only activation collections', () => {
      const activationRefs = graphPlanSkillActivationRefsSchema.parse({});

      expect(activationRefs).toEqual({ references: [], assets: [], scripts: [] });
    });
  });

  describe('graphPlanNodeSchema', () => {
    it('parses discriminated trap and skill nodes', () => {
      const trap = graphPlanNodeSchema.parse({
        kind: 'trap',
        nodeId: 'trap:entry-1',
        sourceId: 'entry-1',
        label: 'Trap node',
        severity: 'hard',
        scope: 'global',
        requiredLevel: 1,
        evidence: 'Trap evidence',
        score: 0.9,
      });

      const skill = graphPlanNodeSchema.parse({
        kind: 'skill',
        nodeId: 'skill:artifact-1',
        artifactId: 'artifact-1',
        label: 'Skill node',
        situation: 'During deploy',
        problem: 'Drift',
        goal: 'Stabilize rollout',
        scope: 'project',
        requiredLevel: 2,
        score: 0.8,
      });

      expect(trap.kind).toBe('trap');
      expect(skill.kind).toBe('skill');
    });
  });

  describe('graphPlanSchema', () => {
    it('parses unified graph outputs with focus metadata', () => {
      const graph = graphPlanSchema.parse({
        nodes: [
          {
            kind: 'trap',
            nodeId: 'trap:e1',
            sourceId: 'e1',
            label: 'Trap node',
            severity: 'hard',
            scope: 'global',
            requiredLevel: 0,
            evidence: 'Evidence',
            score: 0.9,
          },
          {
            kind: 'skill',
            nodeId: 'skill:a1',
            artifactId: 'a1',
            label: 'Skill node',
            situation: 'S',
            problem: 'P',
            goal: 'G',
            scope: 'project',
            requiredLevel: 0,
            score: 0.8,
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'skill:a1',
            targetNodeId: 'trap:e1',
            type: 'mitigates',
            strength: 'hard',
          },
          {
            id: 'edge-2',
            sourceNodeId: 'skill:a1',
            targetNodeId: 'trap:e1',
            type: 'co-occurs-with',
            strength: 'soft',
          },
        ],
        citations: [],
        focus: {
          blockingTrapNodeIds: ['trap:e1'],
          recommendedSkillNodeIds: ['skill:a1'],
        },
      });

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges[1]?.type).toBe('co-occurs-with');
      expect(graph.focus.recommendedSkillNodeIds).toEqual(['skill:a1']);
    });
  });

  describe('planEdgeSchema', () => {
    it('requires id, sourceNodeId, targetNodeId, type, strength', () => {
      const edge = planEdgeSchema.parse({
        id: 'edge-1',
        sourceNodeId: 'skill:art-1',
        targetNodeId: 'trap:entry-1',
        type: 'mitigates',
        strength: 'hard',
      });

      expect(edge.type).toBe('mitigates');
      expect(edge.strength).toBe('hard');
    });
  });

  describe('planCitationSchema', () => {
    it('requires sourceKind of trap or skill', () => {
      const trapCitation = planCitationSchema.parse({
        sourceId: 'entry-2',
        sourceKind: 'trap',
        label: 'Deadlock risk',
        scope: 'global',
        score: 0.6,
      });

      expect(trapCitation.sourceKind).toBe('trap');

      const skillCitation = planCitationSchema.parse({
        sourceId: 'art-3',
        sourceKind: 'skill',
        label: 'Lock ordering pattern',
        scope: 'project',
        score: 0.55,
      });

      expect(skillCitation.sourceKind).toBe('skill');
    });

    it('rejects invalid sourceKind', () => {
      expect(() =>
        planCitationSchema.parse({
          sourceId: 'x',
          sourceKind: 'unknown',
          label: 'Bad',
          scope: 'global',
          score: 0.5,
        }),
      ).toThrow();
    });
  });

  describe('trapFirstPlanSchema', () => {
    it('parses valid plan with all fields populated', () => {
      const plan = trapFirstPlanSchema.parse({
        blockingTraps: [
          {
            nodeId: 'trap:e1',
            sourceId: 'e1',
            label: 'Test trap',
            severity: 'hard',
            scope: 'global',
            requiredLevel: 0,
            evidence: 'Evidence text',
            score: 0.9,
          },
        ],
        recommendedSkills: [
          {
            nodeId: 'skill:a1',
            artifactId: 'a1',
            label: 'Test skill',
            situation: 'S',
            problem: 'P',
            goal: 'G',
            scope: 'global',
            requiredLevel: 0,
            score: 0.8,
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'skill:a1',
            targetNodeId: 'trap:e1',
            type: 'mitigates',
            strength: 'hard',
          },
        ],
        citations: [
          {
            sourceId: 'e2',
            sourceKind: 'trap',
            label: 'Related',
            scope: 'global',
            score: 0.4,
          },
        ],
        graph: {
          nodes: [
            {
              kind: 'trap',
              nodeId: 'trap:e1',
              sourceId: 'e1',
              label: 'Test trap',
              severity: 'hard',
              scope: 'global',
              requiredLevel: 0,
              evidence: 'Evidence text',
              score: 0.9,
            },
            {
              kind: 'skill',
              nodeId: 'skill:a1',
              artifactId: 'a1',
              label: 'Test skill',
              situation: 'S',
              problem: 'P',
              goal: 'G',
              scope: 'global',
              requiredLevel: 0,
              score: 0.8,
            },
          ],
          edges: [
            {
              id: 'edge-1',
              sourceNodeId: 'skill:a1',
              targetNodeId: 'trap:e1',
              type: 'mitigates',
              strength: 'hard',
            },
          ],
          citations: [
            {
              sourceId: 'e2',
              sourceKind: 'trap',
              label: 'Related',
              scope: 'global',
              score: 0.4,
            },
          ],
          focus: {
            blockingTrapNodeIds: ['trap:e1'],
            recommendedSkillNodeIds: ['skill:a1'],
          },
        },
      });

      expect(plan.blockingTraps).toHaveLength(1);
      expect(plan.recommendedSkills).toHaveLength(1);
      expect(plan.edges).toHaveLength(1);
      expect(plan.citations).toHaveLength(1);
      expect(plan.graph.nodes).toHaveLength(2);
    });

    it('defaults to empty arrays when no fields provided', () => {
      const plan = trapFirstPlanSchema.parse({});

      expect(plan.blockingTraps).toEqual([]);
      expect(plan.recommendedSkills).toEqual([]);
      expect(plan.edges).toEqual([]);
      expect(plan.citations).toEqual([]);
      expect(plan.graph).toEqual({
        nodes: [],
        edges: [],
        citations: [],
        focus: {
          blockingTrapNodeIds: [],
          recommendedSkillNodeIds: [],
        },
      });
    });
  });

  describe('planQuerySchema', () => {
    it('defaults skillBudget to 3 and maxDepth to 2 when only seed provided', () => {
      const query = planQuerySchema.parse({ seed: 'test' });

      expect(query.seed).toBe('test');
      expect(query.skillBudget).toBe(3);
      expect(query.maxDepth).toBe(2);
    });

    it('accepts explicit skillBudget and maxDepth', () => {
      const query = planQuerySchema.parse({
        seed: 'how to handle database deadlocks',
        skillBudget: 5,
        maxDepth: 4,
      });

      expect(query.skillBudget).toBe(5);
      expect(query.maxDepth).toBe(4);
    });

    it('rejects skillBudget below 1', () => {
      expect(() =>
        planQuerySchema.parse({ seed: 'test', skillBudget: 0 }),
      ).toThrow();
    });

    it('rejects skillBudget above 10', () => {
      expect(() =>
        planQuerySchema.parse({ seed: 'test', skillBudget: 11 }),
      ).toThrow();
    });

    it('rejects maxDepth above 5', () => {
      expect(() =>
        planQuerySchema.parse({ seed: 'test', maxDepth: 6 }),
      ).toThrow();
    });

    it('rejects empty seed', () => {
      expect(() => planQuerySchema.parse({ seed: '' })).toThrow();
    });
  });
});
