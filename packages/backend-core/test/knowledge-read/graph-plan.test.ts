import { describe, expect, it } from 'vitest';

import {
  compileExecutionPlan,
  computePlanConfidence,
  GRAPH_PLAN_MIN_CONFIDENCE,
  type GraphPlanEdgeInput,
  type GraphPlanNodeInput,
  normalizeGraphPlanQuery,
  planNodeQueryCoverage,
  planPredecessorsOf,
  resolveGraphPlanRoutingReason,
  toGraphPlanEdgeType,
  toPlanEdgeType,
} from '../../src/knowledge-read/domain/graph-plan.js';

function node(overrides: Partial<GraphPlanNodeInput> & { nodeId: string }): GraphPlanNodeInput {
  return {
    kind: 'trap',
    label: `label ${overrides.nodeId}`,
    evidence: 'evidence',
    severity: 'soft',
    sourceId: `source_${overrides.nodeId}`,
    artifactId: `artifact_${overrides.nodeId}`,
    score: 0.5,
    ...overrides,
  };
}

function edge(overrides: Partial<GraphPlanEdgeInput> & { edgeId: string }): GraphPlanEdgeInput {
  return {
    sourceNodeId: 'a',
    targetNodeId: 'b',
    relationType: 'mitigates',
    strength: 'hard',
    ...overrides,
  };
}

describe('plan predecessors', () => {
  it('puts the trap before the skill that mitigates it', () => {
    // Graph data stores mitigates as skill → trap.
    expect(planPredecessorsOf(edge({ sourceNodeId: 'skill', targetNodeId: 'trap' }))).toEqual({
      predecessor: 'trap',
      dependent: 'skill',
    });
  });

  it('resolves requires as the requirement first and order as written', () => {
    expect(
      planPredecessorsOf(edge({ sourceNodeId: 'a', targetNodeId: 'b', relationType: 'requires' })),
    ).toEqual({
      predecessor: 'b',
      dependent: 'a',
    });
    expect(
      planPredecessorsOf(edge({ sourceNodeId: 'a', targetNodeId: 'b', relationType: 'order' })),
    ).toEqual({
      predecessor: 'a',
      dependent: 'b',
    });
    expect(
      planPredecessorsOf(
        edge({ sourceNodeId: 'a', targetNodeId: 'b', relationType: 'risk-blocks' }),
      ),
    ).toEqual({
      predecessor: 'a',
      dependent: 'b',
    });
  });

  it('imposes no ordering for citation-only or unknown relations', () => {
    expect(planPredecessorsOf(edge({ relationType: 'co-occurs-with' }))).toBeNull();
    expect(planPredecessorsOf(edge({ relationType: 'applies-in' }))).toBeNull();
  });
});

describe('execution plan compilation', () => {
  it('assigns traps rank 0 and mitigating skills rank 1 with blockedBy', () => {
    const steps = compileExecutionPlan(
      [node({ nodeId: 'trap_1', kind: 'trap' }), node({ nodeId: 'skill_1', kind: 'skill' })],
      [
        edge({
          edgeId: 'e1',
          sourceNodeId: 'skill_1',
          targetNodeId: 'trap_1',
          relationType: 'mitigates',
        }),
      ],
    );

    expect(steps).toHaveLength(2);
    const trapStep = steps.find((s) => s.nodeId === 'trap_1');
    const skillStep = steps.find((s) => s.nodeId === 'skill_1');
    expect(trapStep).toMatchObject({ rank: 0, kind: 'trap-mitigation', blockedBy: [] });
    expect(skillStep).toMatchObject({ rank: 1, kind: 'skill', blockedBy: ['trap_1'] });
  });

  it('deepens the rank across chained requires edges', () => {
    const steps = compileExecutionPlan(
      [node({ nodeId: 'a' }), node({ nodeId: 'b' }), node({ nodeId: 'c' })],
      [
        edge({ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b', relationType: 'requires' }),
        edge({ edgeId: 'e2', sourceNodeId: 'b', targetNodeId: 'c', relationType: 'requires' }),
      ],
    );

    const rankOf = (id: string) => steps.find((s) => s.nodeId === id)?.rank;
    // a requires b, b requires c → c(0) → b(1) → a(2)
    expect(rankOf('c')).toBe(0);
    expect(rankOf('b')).toBe(1);
    expect(rankOf('a')).toBe(2);
  });

  it('keeps cycle members visible instead of dropping them', () => {
    const steps = compileExecutionPlan(
      [node({ nodeId: 'x' }), node({ nodeId: 'y' })],
      [
        edge({ edgeId: 'e1', sourceNodeId: 'x', targetNodeId: 'y', relationType: 'order' }),
        edge({ edgeId: 'e2', sourceNodeId: 'y', targetNodeId: 'x', relationType: 'order' }),
      ],
    );

    expect(steps).toHaveLength(2);
    // Both nodes survive; at least one keeps an unresolved blockedBy entry.
    const withBlockedBy = steps.filter((s) => s.blockedBy.length > 0);
    expect(withBlockedBy.length).toBeGreaterThan(0);
  });

  it('ignores edges that reference unknown nodes', () => {
    const steps = compileExecutionPlan(
      [node({ nodeId: 'a' })],
      [edge({ edgeId: 'e1', sourceNodeId: 'ghost', targetNodeId: 'a', relationType: 'order' })],
    );
    expect(steps).toEqual([
      { rank: 0, nodeId: 'a', label: 'label a', kind: 'trap-mitigation', blockedBy: [] },
    ]);
  });
});

describe('plan confidence', () => {
  it('is zero for an empty plan and saturates with evidence', () => {
    expect(
      computePlanConfidence({
        trapCount: 0,
        skillCount: 0,
        mitigatedTrapCount: 0,
        hardEdgeCount: 0,
      }).score,
    ).toBe(0);
    const full = computePlanConfidence({
      trapCount: 3,
      skillCount: 3,
      mitigatedTrapCount: 3,
      hardEdgeCount: 3,
    });
    expect(full.score).toBe(1);
    expect(full.bucket).toBe('high');
  });

  it('keeps partial linkage honest: no mitigations means no full credit', () => {
    const withMitigation = computePlanConfidence({
      trapCount: 3,
      skillCount: 3,
      mitigatedTrapCount: 3,
      hardEdgeCount: 0,
    });
    const withoutMitigation = computePlanConfidence({
      trapCount: 3,
      skillCount: 3,
      mitigatedTrapCount: 0,
      hardEdgeCount: 0,
    });
    expect(withoutMitigation.score).toBeLessThan(withMitigation.score);
    expect(withoutMitigation.score).toBeGreaterThan(0);
  });

  it('buckets at the documented thresholds', () => {
    // skill-only evidence saturates at 0.3 → exactly the medium boundary.
    expect(
      computePlanConfidence({
        trapCount: 0,
        skillCount: 3,
        mitigatedTrapCount: 0,
        hardEdgeCount: 0,
      }).bucket,
    ).toBe('medium');
    expect(
      computePlanConfidence({
        trapCount: 0,
        skillCount: 1,
        mitigatedTrapCount: 0,
        hardEdgeCount: 0,
      }).bucket,
    ).toBe('low');
  });
});

describe('routing reason gate', () => {
  it('selects a plan with blockers, actions and sufficient confidence', () => {
    expect(resolveGraphPlanRoutingReason({ trapCount: 2, skillCount: 2, confidence: 0.6 })).toBe(
      'graph-plan-selected',
    );
  });

  it('names the missing evidence dimension', () => {
    expect(resolveGraphPlanRoutingReason({ trapCount: 0, skillCount: 2, confidence: 0.9 })).toBe(
      'graph-plan-insufficient-trap-evidence',
    );
    expect(resolveGraphPlanRoutingReason({ trapCount: 2, skillCount: 0, confidence: 0.9 })).toBe(
      'graph-plan-insufficient-skill-evidence',
    );
  });

  it('falls back below the confidence floor', () => {
    expect(resolveGraphPlanRoutingReason({ trapCount: 1, skillCount: 1, confidence: 0.2 })).toBe(
      'graph-plan-low-confidence',
    );
    expect(GRAPH_PLAN_MIN_CONFIDENCE).toBe(0.5);
  });
});

describe('edge vocabulary mapping', () => {
  it('passes plan-edge relations and drops the rest', () => {
    expect(toPlanEdgeType('mitigates')).toBe('mitigates');
    expect(toPlanEdgeType('requires')).toBe('requires');
    expect(toPlanEdgeType('order')).toBe('order');
    expect(toPlanEdgeType('risk-blocks')).toBe('risk-blocks');
    expect(toPlanEdgeType('co-occurs-with')).toBeNull();
    expect(toPlanEdgeType('applies-in')).toBeNull();
  });

  it('keeps co-occurrence for the graph view only', () => {
    expect(toGraphPlanEdgeType('co-occurs-with')).toBe('co-occurs-with');
    expect(toGraphPlanEdgeType('applies-in')).toBeNull();
  });
});

describe('query coverage', () => {
  it('measures the share of query tokens present in the text', () => {
    const tokens = normalizeGraphPlanQuery('redis stampede');
    expect(planNodeQueryCoverage('redis stampede during cold start', tokens)).toBe(1);
    expect(planNodeQueryCoverage('unrelated topic', tokens)).toBe(0);
    expect(planNodeQueryCoverage('redis only', tokens)).toBe(0.5);
  });
});
