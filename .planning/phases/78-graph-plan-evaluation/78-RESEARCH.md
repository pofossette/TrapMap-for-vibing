# Phase 78: Graph-Plan Evaluation - Research

**Researched:** 2026-05-04
**Domain:** Evaluation infrastructure / structural assertions for v3 graph-plan responses
**Confidence:** HIGH

## Summary

Phase 78 extends the retrieval evaluation system to verify structural correctness of v3 graph-plan responses. Currently, v3 eval cases (smoke and core tiers) only assert that `relevantIds` (capsuleId strings) appear in the normalized result. They never inspect `response.plan.graph.nodes`, `response.plan.graph.edges`, or `response.plan.graph.focus`. This means a plan that returns the right capsule IDs but has completely wrong graph topology would pass every test.

The fix requires changes across 4 layers: (1) contracts schema extension for graph-plan structural expectations, (2) normalization layer to extract graph structure into `NormalizedResult`, (3) assertion functions to compare expected vs actual graph structure, and (4) integration into the runner and existing test cases. An existing PLAN.md with 7 tasks already exists and aligns with this research.

**Primary recommendation:** Follow the layered approach -- extend contracts first, then normalize, then assert, then wire into cases. Each layer builds on the previous and can be verified independently with unit tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shape expectations schema | contracts (Zod) | -- | Canonical schemas live in `packages/contracts/src/domain/evals/retrieval.ts` |
| Graph structure extraction | evals/normalization | -- | `evals/retrieval/lib/normalize.ts` owns response-to-NormalizedResult mapping |
| Structural assertions | evals/assertions | -- | `evals/retrieval/lib/assertions.ts` owns verdict evaluation; also `governance.ts` for runtime checks |
| Test case definitions | evals/datasets | -- | `evals/retrieval/datasets/smoke/` and `datasets/core/` own case fixtures |
| Scenario fixtures | evals/scenarios | -- | `evals/retrieval/scenarios/` own graph index documents |
| Runner integration | evals/runner | -- | `evals/retrieval/run.ts` wires execution, governance, and reporting |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | (in-project) | Schema validation for eval contracts | Project-wide canonical validation library [VERIFIED: packages/contracts] |
| vitest | (in-project) | Test runner for eval unit tests | Project test runner configured in vitest.config.ts [VERIFIED: vitest.config.ts] |
| @trapmap/contracts | (workspace) | Shared types and Zod schemas | Monorepo contracts package [VERIFIED: packages/contracts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastify inject | (in-project) | Route adapter for eval execution | Used by `evals/retrieval/lib/adapters.ts` for route-based execution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New GraphPlanStructure type | Reuse GraphPlan type directly | GraphPlan includes full node objects; evaluation only needs IDs and edges for comparison. Flattening keeps assertion logic simple. |

**Installation:**
No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### System Architecture Diagram

```
eval case definition (shape.graphPlanExpectations)
         |
         v
   eval runner (run.ts)
         |
         v
   adapter executes v3 route --> raw GraphPlanSearchResponse
         |
         v
   normalizeV3Response() --> NormalizedResult (with graphPlanStructure)
         |
         v
   evaluateGovernance() + assertGraphPlanStructure()
         |
         v
   CaseResult (passed/fail with graphPlanResult)
         |
         v
   report output (console + JSON)
```

### Recommended Project Structure
No new files are strictly required. Changes are extensions to existing files:
```
packages/contracts/src/domain/evals/retrieval.ts  -- add graphPlanExpectationsSchema
evals/retrieval/lib/types.ts                       -- add GraphPlanStructure, extend NormalizedResult
evals/retrieval/lib/normalize.ts                   -- populate graphPlanStructure in normalizeV3Response
evals/retrieval/lib/assertions.ts                  -- add assertGraphPlanStructure
evals/retrieval/lib/governance.ts                  -- add v3 graph-plan shape check (or delegate to assertions.ts)
evals/retrieval/run.ts                             -- wire graph-plan assertions into executeAllCases
evals/retrieval/scenarios/core/                    -- add orchestration scenario
evals/retrieval/datasets/smoke/ v3-graph-plan-smoke.ts   -- update shape expectations
evals/retrieval/datasets/core/ v3-graph-plan-core.ts     -- add orchestration case
evals/retrieval/lib/normalize.test.ts              -- add graph structure normalization tests
```

### Pattern 1: Shape Expectations Extension
**What:** Extend `retrievalEvalShapeExpectationsSchema` with an optional `graphPlanExpectations` field.
**When to use:** v3-only cases that need to verify graph structure beyond capsuleId matching.
**Example:**
```typescript
// Source: packages/contracts/src/domain/evals/retrieval.ts
const graphPlanExpectationsSchema = z.object({
  expectedTrapNodeIds: z.array(entityIdSchema).default([]),
  expectedSkillNodeIds: z.array(entityIdSchema).default([]),
  expectedEdges: z.array(z.object({
    sourceNodeId: entityIdSchema,
    targetNodeId: entityIdSchema,
    type: z.enum(['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with']),
  })).default([]),
  expectedBlockingTrapNodeIds: z.array(entityIdSchema).default([]),
  expectedRecommendedSkillNodeIds: z.array(entityIdSchema).default([]),
});
```
The field is optional on `retrievalEvalShapeExpectationsSchema` so v1/v2 cases are unaffected.

### Pattern 2: Normalization Extension
**What:** Extract graph topology from `GraphPlanSearchResponse.plan.graph` into a flat `GraphPlanStructure` on `NormalizedResult`.
**When to use:** Only when `response.plan` is non-null (selected plan path).
**Example:**
```typescript
// Source: evals/retrieval/lib/normalize.ts
if (response.plan) {
  const nodes = response.plan.graph.nodes;
  const graphPlanStructure: GraphPlanStructure = {
    trapNodeIds: nodes.filter(n => n.kind === 'trap').map(n => n.nodeId),
    skillNodeIds: nodes.filter(n => n.kind === 'skill').map(n => n.nodeId),
    edges: response.plan.graph.edges.map(e => ({
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      type: e.type,
    })),
    blockingTrapNodeIds: response.plan.graph.focus.blockingTrapNodeIds,
    recommendedSkillNodeIds: response.plan.graph.focus.recommendedSkillNodeIds,
  };
  // Add to return object
}
```

### Pattern 3: Dual Assertion Paths (Verdicts + Governance)
**What:** The project has two assertion systems: `assertions.ts` (verdict-based, used by test infrastructure) and `governance.ts` (failure-based, used by the runner). Graph-plan assertions need integration into both.
**When to use:** When adding new assertion types that should be verified both in unit tests and in eval runner execution.

### Anti-Patterns to Avoid
- **Asserting on raw response in test cases:** The normalization layer exists to abstract endpoint differences. Assertions should operate on `NormalizedResult`, not raw `GraphPlanSearchResponse`.
- **Breaking existing v1/v2 case schemas:** The `graphPlanExpectations` field MUST be optional with defaults so existing cases continue to parse.
- **Duplicating assertion logic between governance.ts and assertions.ts:** Pick one canonical location and have the other delegate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zod schema for edge expectations | Custom validation function | `z.enum(['risk-blocks', 'mitigates', ...])` | Edge types are already defined in `graphPlanEdgeTypeSchema` in plans.ts |
| Node kind discrimination | Custom type guards | `node.kind === 'trap'` / `node.kind === 'skill'` | The `graphPlanNodeSchema` uses `z.discriminatedUnion('kind', [...])` -- kind is always present |

**Key insight:** All graph-plan types already exist in `packages/contracts/src/domain/plans.ts`. The new schema should reference the same enums, not redefine them.

## Common Pitfalls

### Pitfall 1: Schema Version Mismatch
**What goes wrong:** Adding `graphPlanExpectations` to `retrievalEvalShapeExpectationsSchema` but forgetting to rebuild `@trapmap/contracts` before running eval tests.
**Why it happens:** The eval workspace imports from the built dist, not the source (via alias in vitest.config.ts it uses source, but the eval runner at runtime uses the built package).
**How to avoid:** Always run `pnpm build` after contracts changes before running evals.
**Warning signs:** `Cannot read properties of undefined (reading 'graphPlanExpectations')` or Zod parse failures.

### Pitfall 2: Fallback Responses Have No Graph Structure
**What goes wrong:** Writing assertions that assume `graphPlanStructure` is always defined for v3 responses, but fallback responses (v2-capsule, v1-graph-assisted) have `response.plan === null`.
**Why it happens:** The v3 endpoint falls back to v2 or v1 payloads when confidence is low. These have no graph.
**How to avoid:** Check `graphPlanStructure !== undefined` before asserting. The `assertGraphPlanStructure` function must handle `undefined` gracefully (only fail if expectations are non-empty).
**Warning signs:** Tests fail on fallback-v2 and fallback-v1 smoke cases.

### Pitfall 3: Order-Only Edge Direction
**What goes wrong:** The `order` edge from the orchestration scenario goes from `skill:deploy` to `skill:infra`, meaning "deploy comes after infra". If the planner reverses this, the assertion would fail. The fixture must match the server's assembly direction.
**Why it happens:** Edge direction semantics are subtle: `order` means "source should come after target" or "target precedes source" depending on convention.
**How to avoid:** Use the same direction convention as existing graph index document edges. In the existing `core-graph-plan-selected` scenario, `requires` goes from `primary -> secondary`, meaning primary requires secondary (secondary comes after). For `order`, the existing convention in the codebase shows `source -> target` means source depends on or comes after target.
**Warning signs:** Orchestration case fails because edge direction is reversed.

### Pitfall 4: governance.ts vs assertions.ts Confusion
**What goes wrong:** Adding graph-plan checks to `governance.ts` but not to `assertions.ts`, or vice versa, causing inconsistent behavior between the runner (uses governance.ts) and unit tests (use assertions.ts).
**Why it happens:** Both files implement similar assertion logic but serve different paths.
**How to avoid:** The runner uses `evaluateGovernance()` from `governance.ts`. The verdict-based `assertions.ts` is used by unit tests. For graph-plan structure, the canonical check should go into `governance.ts` (since the runner calls it), and a parallel function in `assertions.ts` for verdicts.
**Warning signs:** Graph-plan failures appear in unit tests but not in eval runner output, or vice versa.

### Pitfall 5: NormalizedResult.graphPlanStructure Not Serialized in Reports
**What goes wrong:** Adding `graphPlanStructure` to `NormalizedResult` but the JSON report serialization in `run.ts` serializes the full `CaseResult` which includes `result.rawResponse` -- the raw response already has the graph data, but the flattened structure is not separately reported.
**Why it happens:** The runner doesn't explicitly extract `graphPlanStructure` for reporting.
**How to avoid:** Add `graphPlanResult` to `CaseResult` and include it in the summary output, or ensure `graphPlanStructure` is visible in the JSON report through the `result` field.

## Code Examples

### Extending retrievalEvalShapeExpectationsSchema
```typescript
// Source: packages/contracts/src/domain/evals/retrieval.ts
// After existing shape schema definition, add:
export const graphPlanExpectationsSchema = z.object({
  expectedTrapNodeIds: z.array(entityIdSchema).default([]),
  expectedSkillNodeIds: z.array(entityIdSchema).default([]),
  expectedEdges: z.array(z.object({
    sourceNodeId: entityIdSchema,
    targetNodeId: entityIdSchema,
    type: graphPlanEdgeTypeSchema,  // Reuse from plans.ts: ['risk-blocks','mitigates','requires','order','co-occurs-with']
  })).default([]),
  expectedBlockingTrapNodeIds: z.array(entityIdSchema).default([]),
  expectedRecommendedSkillNodeIds: z.array(entityIdSchema).default([]),
});

export type GraphPlanExpectations = z.infer<typeof graphPlanExpectationsSchema>;
```

### GraphPlanStructure Interface
```typescript
// Source: evals/retrieval/lib/types.ts
export interface GraphPlanStructure {
  trapNodeIds: string[];
  skillNodeIds: string[];
  edges: Array<{ sourceNodeId: string; targetNodeId: string; type: string }>;
  blockingTrapNodeIds: string[];
  recommendedSkillNodeIds: string[];
}

// Extend NormalizedResult:
export interface NormalizedResult {
  // ... existing fields ...
  graphPlanStructure?: GraphPlanStructure;
}
```

### Graph-Plan Assertion Integration in governance.ts
```typescript
// Source: evals/retrieval/lib/governance.ts
// Add after v2 checks:
if (case_.endpoint === '/v3/retrieval/search') {
  const gpExpectations = case_.expected.shape.graphPlanExpectations;
  if (gpExpectations && result.graphPlanStructure) {
    // Check trap nodes
    for (const expectedId of gpExpectations.expectedTrapNodeIds) {
      if (!result.graphPlanStructure.trapNodeIds.includes(expectedId)) {
        failures.push({
          kind: 'shape-mismatch',
          description: `Expected trap node ${expectedId} not found in graph`,
          ids: [expectedId],
        });
      }
    }
    // ... similar for skill nodes, edges, blocking traps, recommended skills
  }
}
```

### Runner Integration Pattern
```typescript
// Source: evals/retrieval/run.ts (executeAllCases)
// The governance check already runs evaluateGovernance() which handles shape checks.
// If graph-plan checks are added to governance.ts, they automatically run here.
// No additional wiring needed in run.ts IF governance.ts is updated.
const governance = evaluateGovernance(case_, adapterResult.result);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CapsuleId-only assertions for v3 | Full graph structural assertions | This phase | Catches graph assembly bugs that capsuleId matching misses |
| Empty `shape: {}` on v3 cases | `shape: { graphPlanExpectations: {...} }` | This phase | Enables structural verification |

**Deprecated/outdated:**
- None. This is a pure addition; no existing patterns are being replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The eval runner's `evaluateGovernance()` in governance.ts is the correct integration point for graph-plan structural checks | Architecture Patterns | If wrong, assertions won't run during eval execution |
| A2 | `graphPlanEdgeTypeSchema` from plans.ts can be imported into retrieval.ts for the edge type enum | Standard Stack | If wrong, need to redefine the enum locally |
| A3 | The `order` edge in the orchestration scenario will be preserved by the server's plan compiler | Common Pitfalls | If wrong, the orchestration test case will fail |
| A4 | The existing `assertions.ts` verdict pattern does not need to be extended; only governance.ts needs the runtime check | Architecture Patterns | If wrong, unit tests for graph-plan assertions will need a separate verdict function |

## Open Questions

1. **Should graph-plan assertions go into governance.ts or assertions.ts?**
   - What we know: The runner calls `evaluateGovernance()` from governance.ts. The unit tests use `evaluateVerdicts()` from assertions.ts. Both have separate shape check paths for v1 and v2.
   - What's unclear: Whether the planner wants one canonical location or both.
   - Recommendation: Add to governance.ts for runtime execution. Add to assertions.ts for unit test coverage. Both should share the same assertion logic extracted into a shared function.

2. **Should `graphPlanResult` be added to `CaseResult`?**
   - What we know: `CaseResult` currently has `governance`, `metrics`, `warnings`. Graph-plan failures could be folded into `governance.failures` via shape-mismatch kinds.
   - What's unclear: Whether separate reporting is desired.
   - Recommendation: Fold into governance failures for simplicity. Use a distinct failure kind like `'graph-plan-mismatch'` for filtering.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- all changes are to in-project TypeScript code using existing toolchain)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (configured in root vitest.config.ts) |
| Config file | `/home/wunai/project/TrapMap-for-vibing/vitest.config.ts` |
| Quick run command | `pnpm --filter evals vitest run evals/retrieval/lib/normalize.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GPEVAL-01 | graphPlanExpectationsSchema defined in contracts | unit | `pnpm vitest run -c vitest.config.ts --project contracts` | Needs new test or verify via parse in datasets |
| GPEVAL-02 | Multi-skill orchestration scenario with order/requires edges | unit (fixture) | `pnpm vitest run -c vitest.config.ts --project evals` | Scenario to be created |
| GPEVAL-03 | Assertions verify nodes, edges, focus metadata | unit | `pnpm vitest run -c vitest.config.ts --project evals evals/retrieval/lib/assertions.test.ts` | Needs extension |

### Sampling Rate
- **Per task commit:** `pnpm vitest run -c vitest.config.ts --project evals`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Graph-plan assertion unit tests in `evals/retrieval/lib/assertions.test.ts` -- covers GPEVAL-03
- [ ] Graph-plan normalization tests in `evals/retrieval/lib/normalize.test.ts` -- covers structure extraction
- [ ] Contracts schema parse test (can be verified implicitly via case definitions)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/contracts/src/domain/evals/retrieval.ts` -- verified shape expectations schema, all endpoint schemas
- Codebase analysis: `packages/contracts/src/domain/plans.ts` -- verified GraphPlan, GraphPlanNode, GraphPlanFocus, GraphPlanGraphEdge types
- Codebase analysis: `evals/retrieval/lib/types.ts` -- verified NormalizedResult, CaseResult interfaces
- Codebase analysis: `evals/retrieval/lib/normalize.ts` -- verified normalizeV3Response logic and fallback handling
- Codebase analysis: `evals/retrieval/lib/assertions.ts` -- verified Verdict/CaseVerdicts pattern
- Codebase analysis: `evals/retrieval/lib/governance.ts` -- verified evaluateGovernance pattern and v1/v2 shape checks
- Codebase analysis: `evals/retrieval/run.ts` -- verified executeAllCases flow and governance integration point
- Codebase analysis: `vitest.config.ts` -- verified evals project configuration with contracts alias

### Secondary (MEDIUM confidence)
- Existing PLAN.md at `.planning/phases/78-graph-plan-evaluation/PLAN.md` -- cross-referenced task structure

### Tertiary (LOW confidence)
- None -- all findings verified against source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already in project, verified by reading source
- Architecture: HIGH - existing patterns are clear and well-structured; extension points are obvious
- Pitfalls: HIGH - identified from reading the actual code paths (governance.ts vs assertions.ts, fallback handling)

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable codebase, no fast-moving dependencies)
