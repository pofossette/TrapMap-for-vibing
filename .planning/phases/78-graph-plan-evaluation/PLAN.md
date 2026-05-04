---
wave: 1
depends_on: []
files_modified:
  - packages/contracts/src/domain/evals/retrieval.ts
  - evals/retrieval/lib/types.ts
  - evals/retrieval/lib/normalize.ts
  - evals/retrieval/lib/assertions.ts
  - evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts
  - evals/retrieval/scenarios/core/retrieval-core-scenarios.ts
  - evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts
  - evals/retrieval/datasets/core/v3-graph-plan-core.ts
  - evals/retrieval/lib/normalize.test.ts
autonomous: true
requirements: [GPEVAL-01, GPEVAL-02, GPEVAL-03]
---

# Phase 78: Graph-Plan Evaluation

**Goal:** Extend v3 graph-plan evaluation to verify structural correctness of returned plans, not just capsuleId matching.

## Context

The v1.6 milestone audit revealed a critical evaluation gap: v3 graph-plan tests (`v3-graph-plan-smoke.ts`, `v3-graph-plan-core.ts`) only verify that `relevantIds` appear in results, but do NOT verify:

1. **Graph structure**: `response.plan.graph.nodes` and `edges` are never inspected
2. **Blocking trap identification**: `response.plan.graph.focus.blockingTrapNodeIds` correctness
3. **Skill→trap relationships**: `mitigates` edge existence between skill and trap nodes
4. **Multi-skill orchestration**: `order`/`requires` edges between skill nodes
5. **Focus metadata**: `recommendedSkillNodeIds` correctly populated

This phase adds structural assertions for graph-plan responses to ensure the TrapFirstPlan assembly is correct.

---

## Task 78-01: Extend Shape Expectations Schema

**Purpose:** Add graph-plan-specific expectation fields to `retrievalEvalShapeExpectationsSchema`.

<read_first>
- packages/contracts/src/domain/evals/retrieval.ts (existing shape expectations schema)
- packages/contracts/src/domain/plans.ts (TrapFirstPlan, GraphPlan types for reference)
</read_first>

<action>
Extend `retrievalEvalShapeExpectationsSchema` in `packages/contracts/src/domain/evals/retrieval.ts`:

```typescript
/**
 * Graph-plan structural expectations for v3 responses.
 * These assertions verify the plan assembly correctness beyond capsule matching.
 */
export const graphPlanExpectationsSchema = z.object({
  /** Expected trap node IDs in graph.nodes (kind='trap') */
  expectedTrapNodeIds: z.array(entityIdSchema).default([]),
  /** Expected skill node IDs in graph.nodes (kind='skill') */
  expectedSkillNodeIds: z.array(entityIdSchema).default([]),
  /** Expected edge relations: {sourceId, targetId, type} tuples */
  expectedEdges: z.array(z.object({
    sourceNodeId: entityIdSchema,
    targetNodeId: entityIdSchema,
    type: z.enum(['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with']),
  })).default([]),
  /** Expected blocking trap node IDs in focus.blockingTrapNodeIds */
  expectedBlockingTrapNodeIds: z.array(entityIdSchema).default([]),
  /** Expected recommended skill node IDs in focus.recommendedSkillNodeIds */
  expectedRecommendedSkillNodeIds: z.array(entityIdSchema).default([]),
});

export type GraphPlanExpectations = z.infer<typeof graphPlanExpectationsSchema>;
```

Add field to `retrievalEvalShapeExpectationsSchema`:

```typescript
export const retrievalEvalShapeExpectationsSchema = z.object({
  // ... existing fields ...
  /** Graph-plan structural expectations (v3 only) */
  graphPlanExpectations: graphPlanExpectationsSchema.optional(),
});
```

</action>

<acceptance_criteria>
- [ ] `graphPlanExpectationsSchema` defined with all 5 fields
- [ ] Field added to `retrievalEvalShapeExpectationsSchema`
- [ ] Types exported from `@trapmap/contracts`
- [ ] Schema parses valid graph-plan expectations
</acceptance_criteria>

---

## Task 78-02: Add Graph-Plan Normalization Fields

**Purpose:** Extend `NormalizedResult` to expose graph structure for assertions.

<read_first>
- evals/retrieval/lib/types.ts (NormalizedResult interface)
- evals/retrieval/lib/normalize.ts (normalizeV3Response function)
</read_first>

<action>
1. Extend `NormalizedResult` interface in `evals/retrieval/lib/types.ts`:

```typescript
/**
 * Graph-plan structure extracted from v3 responses.
 */
export interface GraphPlanStructure {
  /** All trap node IDs */
  trapNodeIds: string[];
  /** All skill node IDs */
  skillNodeIds: string[];
  /** Edge tuples: {source, target, type} */
  edges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
  }>;
  /** Focus blocking traps */
  blockingTrapNodeIds: string[];
  /** Focus recommended skills */
  recommendedSkillNodeIds: string[];
}

export interface NormalizedResult {
  // ... existing fields ...

  /** Graph-plan structure (v3 only, undefined for v1/v2) */
  graphPlanStructure?: GraphPlanStructure;
}
```

2. Update `normalizeV3Response` in `evals/retrieval/lib/normalize.ts` to populate `graphPlanStructure`:

```typescript
export function normalizeV3Response(response: GraphPlanSearchResponse): NormalizedResult {
  // ... existing code ...

  if (response.plan) {
    const nodes = response.plan.graph.nodes;
    const edges = response.plan.graph.edges;
    const focus = response.plan.graph.focus;

    const graphPlanStructure: GraphPlanStructure = {
      trapNodeIds: nodes.filter(n => n.kind === 'trap').map(n => n.nodeId),
      skillNodeIds: nodes.filter(n => n.kind === 'skill').map(n => n.nodeId),
      edges: edges.map(e => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        type: e.type,
      })),
      blockingTrapNodeIds: focus.blockingTrapNodeIds,
      recommendedSkillNodeIds: focus.recommendedSkillNodeIds,
    };

    return {
      // ... existing fields ...
      graphPlanStructure,
    };
  }
  // ... fallback cases ...
}
```

</action>

<acceptance_criteria>
- [ ] `GraphPlanStructure` interface defined
- [ ] `graphPlanStructure` optional field added to `NormalizedResult`
- [ ] `normalizeV3Response` populates structure for selected plans
- [ ] Structure is undefined for v1/v2 responses and v3 fallbacks
</acceptance_criteria>

---

## Task 78-03: Add Graph-Plan Structural Assertions

**Purpose:** Create assertion functions to verify graph-plan structure against expectations.

<read_first>
- evals/retrieval/lib/assertions.ts (existing assertion patterns)
- evals/retrieval/lib/types.ts (GovernanceFailure pattern for error reporting)
</read_first>

<action>
Add to `evals/retrieval/lib/assertions.ts`:

```typescript
/**
 * Graph-plan structural assertion result.
 */
export interface GraphPlanAssertionResult {
  passed: boolean;
  failures: GraphPlanFailure[];
}

export interface GraphPlanFailure {
  kind:
    | 'missing-trap-node'
    | 'missing-skill-node'
    | 'missing-edge'
    | 'missing-blocking-trap'
    | 'missing-recommended-skill'
    | 'unexpected-empty-graph';
  description: string;
  expected: string[];
  actual: string[];
}

/**
 * Assert graph-plan structure matches expectations.
 */
export function assertGraphPlanStructure(
  structure: GraphPlanStructure | undefined,
  expectations: GraphPlanExpectations
): GraphPlanAssertionResult {
  const failures: GraphPlanFailure[] = [];

  // Skip if no graph-plan structure (v1/v2 or fallback)
  if (!structure) {
    if (expectations.expectedTrapNodeIds.length > 0 ||
        expectations.expectedSkillNodeIds.length > 0) {
      failures.push({
        kind: 'unexpected-empty-graph',
        description: 'Expected graph-plan structure but response had none',
        expected: [...expectations.expectedTrapNodeIds, ...expectations.expectedSkillNodeIds],
        actual: [],
      });
    }
    return { passed: failures.length === 0, failures };
  }

  // Check trap nodes
  for (const expectedId of expectations.expectedTrapNodeIds) {
    if (!structure.trapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-trap-node',
        description: `Expected trap node ${expectedId} not found`,
        expected: [expectedId],
        actual: structure.trapNodeIds,
      });
    }
  }

  // Check skill nodes
  for (const expectedId of expectations.expectedSkillNodeIds) {
    if (!structure.skillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-skill-node',
        description: `Expected skill node ${expectedId} not found`,
        expected: [expectedId],
        actual: structure.skillNodeIds,
      });
    }
  }

  // Check edges
  for (const expectedEdge of expectations.expectedEdges) {
    const found = structure.edges.some(e =>
      e.sourceNodeId === expectedEdge.sourceNodeId &&
      e.targetNodeId === expectedEdge.targetNodeId &&
      e.type === expectedEdge.type
    );
    if (!found) {
      failures.push({
        kind: 'missing-edge',
        description: `Expected edge ${expectedEdge.sourceNodeId} -> ${expectedEdge.targetNodeId} (${expectedEdge.type}) not found`,
        expected: [`${expectedEdge.sourceNodeId}->${expectedEdge.targetNodeId}:${expectedEdge.type}`],
        actual: structure.edges.map(e => `${e.sourceNodeId}->${e.targetNodeId}:${e.type}`),
      });
    }
  }

  // Check blocking traps
  for (const expectedId of expectations.expectedBlockingTrapNodeIds) {
    if (!structure.blockingTrapNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-blocking-trap',
        description: `Expected blocking trap ${expectedId} not in focus`,
        expected: [expectedId],
        actual: structure.blockingTrapNodeIds,
      });
    }
  }

  // Check recommended skills
  for (const expectedId of expectations.expectedRecommendedSkillNodeIds) {
    if (!structure.recommendedSkillNodeIds.includes(expectedId)) {
      failures.push({
        kind: 'missing-recommended-skill',
        description: `Expected recommended skill ${expectedId} not in focus`,
        expected: [expectedId],
        actual: structure.recommendedSkillNodeIds,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}
```

</action>

<acceptance_criteria>
- [ ] `GraphPlanAssertionResult` and `GraphPlanFailure` types defined
- [ ] `assertGraphPlanStructure` function implemented
- [ ] All 5 expectation types checked
- [ ] Failures include expected vs actual for debugging
</acceptance_criteria>

---

## Task 78-04: Add Multi-Skill Orchestration Test Scenario

**Purpose:** Create a scenario with multiple skills connected by order/requires edges.

<read_first>
- evals/retrieval/scenarios/smoke/retrieval-smoke-scenarios.ts (smokeGraphPlanSelectedScenario pattern)
- evals/retrieval/scenarios/core/retrieval-core-scenarios.ts (core scenario patterns)
</read_first>

<action>
Add to `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts`:

```typescript
/**
 * Scenario: Multi-skill orchestration with order dependencies.
 * Two skills connected by 'order' edge, both mitigating same trap.
 * Tests: order edge, multiple mitigates edges, multi-skill focus.
 */
export const coreGraphPlanOrchestrationScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-orchestration',
  description:
    'Multi-skill orchestration with order dependencies. First skill sets up infrastructure, second skill deploys application. Both mitigate deployment blocker.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_orchestration_trap',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['deployment', 'infrastructure', 'ordering'],
        shortcut: 'Deployment ordering blocker',
        detail: 'Deployment fails when application deployed before infrastructure is ready.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_orchestration_infra',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['infrastructure', 'setup'],
        title: 'Infrastructure Setup Skill',
        slug: 'infrastructure-setup-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_orchestration_infra',
            content: 'Set up infrastructure before deployment',
            situation: 'Preparing for application deployment',
            problem: 'Missing infrastructure blocks deployment',
            goal: 'Provision required infrastructure',
            labels: ['infrastructure', 'setup'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_orchestration_deploy',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['deployment', 'application'],
        title: 'Application Deployment Skill',
        slug: 'application-deployment-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_orchestration_deploy',
            content: 'Deploy application after infrastructure ready',
            situation: 'Infrastructure provisioned',
            problem: 'Need to deploy application correctly',
            goal: 'Successful application deployment',
            labels: ['deployment', 'application'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_core_orchestration_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_orchestration_trap',
        revision: 1,
        contentHash: 'core-orchestration-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_orchestration_trap',
            kind: 'trap',
            label: 'deployment ordering blocker',
            evidence: 'application deployed before infrastructure',
          },
        ],
        edges: [],
        evidence: 'derived from orchestration trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_orchestration_infra_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_orchestration_infra',
        revision: 1,
        contentHash: 'core-orchestration-infra-skill',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_orchestration_infra',
            kind: 'skill',
            label: 'infrastructure setup skill',
            evidence: 'provision infrastructure first',
          },
        ],
        edges: [
          {
            id: 'skill:infra->trap:orchestration:mitigates',
            sourceNodeId: 'skill:artifact_core_orchestration_infra',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'infrastructure setup mitigates ordering blocker',
          },
        ],
        evidence: 'derived from infra skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_orchestration_deploy_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_orchestration_deploy',
        revision: 1,
        contentHash: 'core-orchestration-deploy-skill',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_orchestration_deploy',
            kind: 'skill',
            label: 'application deployment skill',
            evidence: 'deploy after infra ready',
          },
        ],
        edges: [
          {
            id: 'skill:deploy->trap:orchestration:mitigates',
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'deployment skill mitigates ordering blocker',
          },
          {
            id: 'skill:deploy->skill:infra:order',
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'skill:artifact_core_orchestration_infra',
            relationType: 'order',
            strength: 'soft',
            evidence: 'deploy must come after infra setup',
          },
        ],
        evidence: 'derived from deploy skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;
```

</action>

<acceptance_criteria>
- [ ] Scenario defines 1 trap + 2 skills
- [ ] Graph documents include `mitigates` edges from both skills to trap
- [ ] Graph documents include `order` edge between skills
- [ ] Scenario exported in core scenarios map
</acceptance_criteria>

---

## Task 78-05: Add Graph-Plan Structural Test Cases

**Purpose:** Create test cases that verify graph structure, not just capsuleId matching.

<read_first>
- evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts (existing v3 smoke cases)
- evals/retrieval/datasets/core/v3-graph-plan-core.ts (existing v3 core cases)
</read_first>

<action>
1. Update `v3GraphPlanSelectedSmoke` in `evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts`:

```typescript
export const v3GraphPlanSelectedSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-selected-smoke',
  tier: 'smoke',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'docker compose deployment guardrail',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'smoke-graph-plan-selected',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_graph_selected'],
      idealOrder: ['capsule_smoke_graph_selected'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_smoke_graph_selected'],
        expectedSkillNodeIds: ['skill:artifact_smoke_graph_selected'],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_smoke_graph_selected',
            targetNodeId: 'trap:knowledge_smoke_graph_selected',
            type: 'mitigates',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_smoke_graph_selected'],
        expectedRecommendedSkillNodeIds: ['skill:artifact_smoke_graph_selected'],
      },
    },
  },
  tags: ['smoke', 'v3', 'graph-plan', 'selected', 'structure', 'mitigates-edge'],
}) as RetrievalEvalCase;
```

2. Add new case to `evals/retrieval/datasets/core/v3-graph-plan-core.ts`:

```typescript
export const v3GraphPlanOrchestrationCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-orchestration-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'deployment ordering infrastructure application',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-orchestration',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_orchestration_infra', 'capsule_core_orchestration_deploy'],
      idealOrder: ['capsule_core_orchestration_infra', 'capsule_core_orchestration_deploy'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_core_orchestration_trap'],
        expectedSkillNodeIds: [
          'skill:artifact_core_orchestration_infra',
          'skill:artifact_core_orchestration_deploy',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_orchestration_infra',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'skill:artifact_core_orchestration_infra',
            type: 'order',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_core_orchestration_trap'],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_orchestration_infra',
          'skill:artifact_core_orchestration_deploy',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'orchestration', 'order-edge', 'multi-skill'],
}) as RetrievalEvalCase;

// Add to exports
export const v3GraphPlanCoreCases: RetrievalEvalCase[] = [
  v3GraphPlanSelectedCore,
  v3GraphPlanGovernanceCore,
  v3GraphPlanOrchestrationCore,
];
```

</action>

<acceptance_criteria>
- [ ] Smoke case updated with graphPlanExpectations
- [ ] Core orchestration case added with order edge expectations
- [ ] Both mitigates and order edges tested
- [ ] Focus metadata expectations specified
</acceptance_criteria>

---

## Task 78-06: Integrate Graph-Plan Assertions into Case Execution

**Purpose:** Run graph-plan assertions during case execution and report failures.

<read_first>
- evals/retrieval/lib/adapters.ts (executeCase pattern)
- evals/retrieval/lib/report.ts (report building pattern)
</read_first>

<action>
1. Add `graphPlanResult` to `CaseResult` in `evals/retrieval/lib/types.ts`:

```typescript
export interface CaseResult {
  // ... existing fields ...
  /** Graph-plan structural assertion result (v3 only) */
  graphPlanResult?: GraphPlanAssertionResult;
}
```

2. Update case execution in `evals/retrieval/run.ts` or `evals/retrieval/lib/adapters.ts` to run graph-plan assertions:

```typescript
// After normalization, check graph-plan expectations
if (endpoint === '/v3/retrieval/search' && expected.shape.graphPlanExpectations) {
  const graphPlanResult = assertGraphPlanStructure(
    result.graphPlanStructure,
    expected.shape.graphPlanExpectations,
  );
  // Add to case result
}
```

3. Include graph-plan failures in pass/fail determination.

</action>

<acceptance_criteria>
- [ ] Graph-plan assertions run for v3 cases with expectations
- [ ] Failures reported in case result
- [ ] Pass/fail status includes graph-plan check
- [ ] Report output shows graph-plan failures
</acceptance_criteria>

---

## Task 78-07: Add Normalization Tests for Graph-Plan Structure

**Purpose:** Verify `normalizeV3Response` correctly extracts graph structure.

<read_first>
- evals/retrieval/lib/normalize.test.ts (existing test patterns)
</read_first>

<action>
Add tests to `evals/retrieval/lib/normalize.test.ts`:

```typescript
describe('normalizeV3Response graph-plan structure', () => {
  it('extracts trap and skill node IDs', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: { /* ... */ },
      plan: {
        graph: {
          nodes: [
            { kind: 'trap', nodeId: 'trap:1', /* ... */ },
            { kind: 'skill', nodeId: 'skill:1', /* ... */ },
            { kind: 'skill', nodeId: 'skill:2', /* ... */ },
          ],
          edges: [],
          citations: [],
          focus: { blockingTrapNodeIds: ['trap:1'], recommendedSkillNodeIds: ['skill:1', 'skill:2'] },
        },
      },
    };

    const result = normalizeV3Response(response);

    expect(result.graphPlanStructure?.trapNodeIds).toEqual(['trap:1']);
    expect(result.graphPlanStructure?.skillNodeIds).toEqual(['skill:1', 'skill:2']);
  });

  it('extracts edges with type information', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: { /* ... */ },
      plan: {
        graph: {
          nodes: [
            { kind: 'trap', nodeId: 'trap:1', /* ... */ },
            { kind: 'skill', nodeId: 'skill:1', /* ... */ },
          ],
          edges: [
            { id: 'e1', sourceNodeId: 'skill:1', targetNodeId: 'trap:1', type: 'mitigates', strength: 'hard' },
          ],
          citations: [],
          focus: { blockingTrapNodeIds: ['trap:1'], recommendedSkillNodeIds: ['skill:1'] },
        },
      },
    };

    const result = normalizeV3Response(response);

    expect(result.graphPlanStructure?.edges).toEqual([
      { sourceNodeId: 'skill:1', targetNodeId: 'trap:1', type: 'mitigates' },
    ]);
  });

  it('returns undefined graphPlanStructure for fallback responses', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: { /* ... */ },
      fallback: {
        routeFamily: 'capsule',
        response: { capsules: [], profileHints: [] },
      },
    };

    const result = normalizeV3Response(response);

    expect(result.graphPlanStructure).toBeUndefined();
  });
});
```

</action>

<acceptance_criteria>
- [ ] Tests for node ID extraction
- [ ] Tests for edge extraction
- [ ] Tests for focus metadata extraction
- [ ] Tests for fallback case (undefined structure)
</acceptance_criteria>

---

## Verification

After all tasks complete, run:

```bash
# Build contracts
pnpm build

# Run retrieval eval with v3 endpoint filter
pnpm eval:retrieval --tier smoke --endpoint /v3/retrieval/search --verbose

# Run core tier
pnpm eval:retrieval --tier core --endpoint /v3/retrieval/search --verbose

# Run normalization tests
pnpm --filter evals test normalize.test.ts
```

Expected outcomes:
- Smoke v3 graph-plan test verifies mitigates edge
- Core orchestration test verifies order edge and multi-skill focus
- All normalization tests pass
- Report output shows graph-plan assertion results

---

## must_haves

Derived from phase goal:

1. **GPEVAL-01**: Graph-plan structural expectations schema defined in contracts
2. **GPEVAL-02**: Multi-skill orchestration test scenario with order/requires edges
3. **GPEVAL-03**: Assertions verify nodes, edges, and focus metadata correctness
