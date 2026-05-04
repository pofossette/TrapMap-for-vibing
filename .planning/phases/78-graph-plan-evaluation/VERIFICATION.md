---
phase: 78-graph-plan-evaluation
verified: 2026-05-04
status: complete
verifier: Claude Opus 4.6
---

# Phase 78 Verification: Graph-Plan Evaluation

**Phase Goal:** Extend v3 graph-plan evaluation to verify structural correctness of returned plans, not just capsuleId matching.

## Requirement Traceability

**Note:** REQUIREMENTS.md not found at `.planning/REQUIREMENTS.md`. Requirement IDs traced from PLAN frontmatter and must_haves sections.

| Requirement ID | Description | Status | Evidence |
|----------------|-------------|--------|----------|
| **GPEVAL-01** | Graph-plan structural expectations schema defined in contracts | ✅ COMPLETE | `packages/contracts/src/domain/evals/retrieval.ts` lines 181-198: `graphPlanExpectationsSchema` with 5 fields |
| **GPEVAL-02** | Multi-skill orchestration test scenario with order/requires edges | ✅ COMPLETE | `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts` line 863: `coreGraphPlanOrchestrationScenario` with order edge |
| **GPEVAL-03** | Assertions verify nodes, edges, and focus metadata correctness | ✅ COMPLETE | Both `assertions.ts` and `governance.ts` implement structural checks |

---

## Must-Haves Verification

### Wave 1 (PLAN.md)

| Must-Have | Verification | Status |
|-----------|--------------|--------|
| **GPEVAL-01**: Graph-plan structural expectations schema defined in contracts | `graphPlanExpectationsSchema` in `retrieval.ts` with `expectedTrapNodeIds`, `expectedSkillNodeIds`, `expectedEdges`, `expectedBlockingTrapNodeIds`, `expectedRecommendedSkillNodeIds` | ✅ |
| **GPEVAL-02**: Multi-skill orchestration test scenario with order/requires edges | `coreGraphPlanOrchestrationScenario` defines 1 trap + 2 skills with `mitigates` and `order` edges | ✅ |
| **GPEVAL-03**: Assertions verify nodes, edges, and focus metadata correctness | `assertGraphPlanStructure` in `assertions.ts` checks all 5 expectation types; `evaluateVerdicts` integrates for v3 | ✅ |

### Wave 2 (78-02-PLAN.md)

| Must-Have | Verification | Status |
|-----------|--------------|--------|
| **GPEVAL-03**: Graph-plan assertions run through `evaluateGovernance()` in `governance.ts` | `checkV3GraphPlanStructure` function added; called in `evaluateGovernance` for v3 endpoint | ✅ |
| **GPEVAL-03**: Graph-plan verdicts available through `evaluateVerdicts()` in `assertions.ts` | `assertGraphPlanStructure` integrated into `evaluateVerdicts` for v3 cases | ✅ |
| **GPEVAL-03**: Existing core v3 cases updated with structural expectations | `v3GraphPlanSelectedCore` has populated `graphPlanExpectations` | ✅ |

---

## File-by-File Verification

### 1. `packages/contracts/src/domain/evals/retrieval.ts`

**Task 78-01 (GPEVAL-01)**

- [x] `graphPlanExpectationsSchema` defined (lines 181-196)
- [x] All 5 expectation fields present:
  - `expectedTrapNodeIds: z.array(entityIdSchema).default([])`
  - `expectedSkillNodeIds: z.array(entityIdSchema).default([])`
  - `expectedEdges` with `sourceNodeId`, `targetNodeId`, `type` (enum)
  - `expectedBlockingTrapNodeIds: z.array(entityIdSchema).default([])`
  - `expectedRecommendedSkillNodeIds: z.array(entityIdSchema).default([])`
- [x] Edge type enum matches `GraphPlanEdgeType`: `['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with']`
- [x] Field added to `retrievalEvalShapeExpectationsSchema` (line 222)
- [x] Types exported (`GraphPlanExpectations`)

### 2. `evals/retrieval/lib/types.ts`

**Task 78-02 (GPEVAL-01)**

- [x] `GraphPlanStructure` interface defined (lines 64-79)
- [x] Fields: `trapNodeIds`, `skillNodeIds`, `edges`, `blockingTrapNodeIds`, `recommendedSkillNodeIds`
- [x] `graphPlanStructure?: GraphPlanStructure` added to `NormalizedResult` (line 136)
- [x] `GovernanceFailureKind` includes `'graph-plan-mismatch'` (line 151)
- [x] `graphPlanResult` added to `CaseResult` (line 341)

### 3. `evals/retrieval/lib/normalize.ts`

**Task 78-02 (GPEVAL-01)**

- [x] `graphPlanStructure` populated in `normalizeV3Response` for selected plans (lines 138-167)
- [x] Structure extraction:
  - `trapNodeIds` from `nodes.filter(n => n.kind === 'trap')`
  - `skillNodeIds` from `nodes.filter(n => n.kind === 'skill')`
  - `edges` mapped with `sourceNodeId`, `targetNodeId`, `type`
  - `blockingTrapNodeIds` from `focus.blockingTrapNodeIds`
  - `recommendedSkillNodeIds` from `focus.recommendedSkillNodeIds`
- [x] Structure undefined for fallback responses

### 4. `evals/retrieval/lib/assertions.ts`

**Task 78-03 (GPEVAL-03)**

- [x] `GraphPlanAssertionResult` interface defined (lines 245-248)
- [x] `GraphPlanFailure` interface defined (lines 250-261)
- [x] Failure kinds: `missing-trap-node`, `missing-skill-node`, `missing-edge`, `missing-blocking-trap`, `missing-recommended-skill`, `unexpected-empty-graph`
- [x] `assertGraphPlanStructure` function implemented (lines 267-358)
- [x] All 5 expectation types checked
- [x] Integration in `evaluateVerdicts` for v3 endpoint (lines 406-428)

### 5. `evals/retrieval/lib/governance.ts`

**Task 78-08 (GPEVAL-03)**

- [x] `checkV3GraphPlanStructure` function added (lines 164-253)
- [x] Returns `GovernanceFailure[]` for consistency with other check functions
- [x] Handles missing `graphPlanStructure` gracefully
- [x] Checks all 5 expectation types
- [x] Integration in `evaluateGovernance` for v3 endpoint (lines 300-307)

### 6. `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts`

**Task 78-04 (GPEVAL-02)**

- [x] `coreGraphPlanOrchestrationScenario` defined (line 863)
- [x] 1 trap node: `trap:knowledge_core_orchestration_trap`
- [x] 2 skill nodes: `skill:artifact_core_orchestration_infra`, `skill:artifact_core_orchestration_deploy`
- [x] `mitigates` edges from both skills to trap
- [x] `order` edge from deploy skill to infra skill
- [x] Exported in scenarios map (line 1044)

### 7. `evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts`

**Task 78-05 (GPEVAL-01, GPEVAL-02)**

- [x] `v3GraphPlanSelectedSmoke` has `graphPlanExpectations` populated (lines 33-45)
- [x] Tests `mitigates` edge
- [x] Tests focus metadata

### 8. `evals/retrieval/datasets/core/v3-graph-plan-core.ts`

**Task 78-05 (GPEVAL-01, GPEVAL-02)**

- [x] `v3GraphPlanSelectedCore` has `graphPlanExpectations` (lines 33-61)
- [x] Tests `mitigates` and `requires` edges
- [x] `v3GraphPlanGovernanceCore` has empty shape (intentional for governance testing) (line 92)
- [x] `v3GraphPlanOrchestrationCore` has `graphPlanExpectations` (lines 120-148)
- [x] Tests `mitigates` and `order` edges

### 9. `evals/retrieval/lib/normalize.test.ts`

**Task 78-07 (GPEVAL-01)**

- [x] Test suite `normalizeV3Response graph-plan structure` (lines 664-899)
- [x] Test: "extracts trap and skill node IDs" (lines 665-737)
- [x] Test: "extracts edges with type information" (lines 739-807)
- [x] Test: "extracts focus metadata (blocking traps and recommended skills)" (lines 809-868)
- [x] Test: "returns undefined graphPlanStructure for fallback responses" (lines 870-898)

---

## Test Results

```
pnpm build           # PASS - TypeScript compilation clean
pnpm test            # PASS - 2427 tests pass, 34 skipped
pnpm vitest run evals/retrieval/lib/normalize.test.ts  # PASS - 24 tests
```

---

## Acceptance Criteria Summary

### Task 78-01: Extend Shape Expectations Schema
- [x] `graphPlanExpectationsSchema` defined with all 5 fields
- [x] Field added to `retrievalEvalShapeExpectationsSchema`
- [x] Types exported from `@trapmap/contracts`
- [x] Schema parses valid graph-plan expectations

### Task 78-02: Add Graph-Plan Normalization Fields
- [x] `GraphPlanStructure` interface defined
- [x] `graphPlanStructure` optional field added to `NormalizedResult`
- [x] `normalizeV3Response` populates structure for selected plans
- [x] Structure is undefined for v1/v2 responses and v3 fallbacks

### Task 78-03: Add Graph-Plan Structural Assertions
- [x] `GraphPlanAssertionResult` and `GraphPlanFailure` types defined
- [x] `assertGraphPlanStructure` function implemented
- [x] All 5 expectation types checked
- [x] Failures include expected vs actual for debugging

### Task 78-04: Add Multi-Skill Orchestration Test Scenario
- [x] Scenario defines 1 trap + 2 skills
- [x] Graph documents include `mitigates` edges from both skills to trap
- [x] Graph documents include `order` edge between skills
- [x] Scenario exported in core scenarios map

### Task 78-05: Add Graph-Plan Structural Test Cases
- [x] Smoke case updated with `graphPlanExpectations`
- [x] Core orchestration case added with order edge expectations
- [x] Both mitigates and order edges tested
- [x] Focus metadata expectations specified

### Task 78-06: Integrate Graph-Plan Assertions into Case Execution
- [x] Graph-plan assertions run for v3 cases with expectations
- [x] Failures reported in case result
- [x] Pass/fail status includes graph-plan check
- [x] Report output shows graph-plan failures

### Task 78-07: Add Normalization Tests for Graph-Plan Structure
- [x] Tests for node ID extraction
- [x] Tests for edge extraction
- [x] Tests for focus metadata extraction
- [x] Tests for fallback case (undefined structure)

### Task 78-08: Add Graph-Plan Checks to Governance Evaluation
- [x] `checkV3GraphPlanStructure` function added to governance.ts
- [x] `evaluateGovernance` calls graph-plan checks for v3 endpoint cases
- [x] `GovernanceFailureKind` includes `'graph-plan-mismatch'`
- [x] All 5 expectation types checked
- [x] Graceful handling when `graphPlanStructure` is undefined

---

## Conclusion

**Phase 78 is COMPLETE.** All three requirement IDs (GPEVAL-01, GPEVAL-02, GPEVAL-03) have been fully implemented and verified:

1. **GPEVAL-01**: Graph-plan structural expectations schema is defined in contracts with all 5 fields
2. **GPEVAL-02**: Multi-skill orchestration scenario with order/requires edges is implemented
3. **GPEVAL-03**: Structural assertions verify nodes, edges, and focus metadata in both:
   - `governance.ts` (runner execution path)
   - `assertions.ts` (verdict/unit test path)

The implementation correctly handles:
- Selected plan responses (graph structure populated)
- Fallback responses (structure undefined)
- Missing structure when expectations exist (graceful failure)
- All 5 expectation types (trap nodes, skill nodes, edges, blocking traps, recommended skills)
