---
status: clean
phase: 78-graph-plan-evaluation
depth: standard
files_reviewed: 10
critical: 0
warning: 0
info: 4
total: 4
reviewed: 2026-05-04
---

---
status: clean
phase: 78-graph-plan-evaluation
depth: standard
files_reviewed: 10
critical: 0
warning: 0
info: 4
total: 4
reviewed: 2026-05-04
---

# Phase 78: Graph-Plan Evaluation Review

**Review Date**: 2026-05-04
**Review Depth**: Standard

---

## Executive Summary

The retrieval evaluation framework provides a comprehensive, well-architected system for evaluating retrieval endpoints across three API versions (v1, v2, v3). The implementation demonstrates strong separation of concerns, clear contract definitions via Zod schemas, and robust normalization/governance layers. The v3 graph-plan evaluation support is thoughtfully designed with structural assertions for nodes, edges, and focus metadata.

---

## File-by-File Analysis

### 1. `packages/contracts/src/domain/evals/retrieval.ts`

**Purpose**: Canonical Zod schemas defining evaluation contracts.

**Strengths**:
- Clean schema hierarchy: `RetrievalEvalTier` → `RetrievalEvalEndpoint` → `RetrievalEvalCase`
- Explicit endpoint targeting (`/v1/retrieval/search`, `/v2/retrieval/search`, `/v3/retrieval/search`) prevents adapter drift
- Clear separation between relevance expectations (ranking quality) and governance expectations (permission correctness)
- `GraphPlanExpectations` schema supports structural assertions for v3 responses

**Observations**:
- Schema version field (`schemaVersion: z.literal(1)`) supports future contract evolution
- `graphPlanExpectationsSchema` covers all critical graph elements: trap nodes, skill nodes, edges, blocking traps, and recommended skills
- Edge types are explicitly enumerated: `['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with']`

**No issues found.**

---

### 2. `evals/retrieval/lib/types.ts`

**Purpose**: Shared runner result and slice types for evaluation execution.

**Strengths**:
- Comprehensive type coverage: execution metadata, normalized results, governance, metrics
- `GraphPlanStructure` interface cleanly extracts v3 response structure for assertions
- `SliceMetrics` includes baseline-aware fields for regression tracking (Phase 29-03)
- Helper functions (`deriveQueryType`, `deriveRouteFamily`, `getCohortKeyString`) provide consistent cohort classification

**Observations**:
- `NormalizedResult` elegantly handles endpoint differences while providing a common shape
- `routingTrace` field captures v3-specific routing metadata
- `CaseResult` includes optional `graphPlanResult` for v3 structural assertions

**No issues found.**

---

### 3. `evals/retrieval/lib/normalize.ts`

**Purpose**: Endpoint-specific response normalization.

**Strengths**:
- Three dedicated normalizers: `normalizeV1Response`, `normalizeV2Response`, `normalizeV3Response`
- v3 normalizer handles all three cases: selected plan, capsule fallback, entry fallback
- Preserves raw response for diagnostics
- Extracts `graphPlanStructure` from v3 plan responses with nodes, edges, and focus metadata

**Key Implementation Details**:
- v1: Extracts from `globalConstraints` and `projectKnowledge` buckets, sorts by score
- v2: Extracts from `capsules` array, captures `profileHints`
- v3: Filters recommended skills from `graph.nodes`, extracts full graph structure

**Observations**:
- `normalizeV3Response` correctly delegates to v1/v2 normalizers for fallback responses while preserving routing trace
- Empty response handling is consistent across all endpoints

**No issues found.**

---

### 4. `evals/retrieval/lib/governance.ts`

**Purpose**: Governance assertion layer for retrieval evaluation.

**Strengths**:
- Clear separation of concerns: forbidden hits, outcome matching, shape verification
- Dedicated checks for each endpoint: v1 buckets, v2 profile hints, v3 graph-plan structure
- `checkV3GraphPlanStructure` provides comprehensive structural validation

**Observations**:
- The file appears to be a focused governance module that complements the broader assertions layer
- `GovernanceFailure` types are well-defined: `forbidden-hit`, `unexpected-empty`, `unexpected-non-empty`, `shape-mismatch`, `graph-plan-mismatch`

**Potential Duplication**:
- There is some overlap with `assertions.ts` (both implement shape assertions)
- Consider consolidating or clearly delineating responsibilities between these two modules

---

### 5. `evals/retrieval/lib/assertions.ts`

**Purpose**: Verdict-based assertion layer with graph-plan structural assertions.

**Strengths**:
- Verdict pattern provides explicit pass/fail records with detailed failure information
- `GraphPlanAssertionResult` and `GraphPlanFailure` types provide rich structural failure diagnostics
- `assertGraphPlanStructure` checks all graph elements: trap nodes, skill nodes, edges, blocking traps, recommended skills
- `evaluateVerdicts` aggregates all verdicts for comprehensive case evaluation

**Observations**:
- More comprehensive than `governance.ts` for verdict evaluation
- `GraphPlanFailure.kind` provides granular failure categorization: `missing-trap-node`, `missing-skill-node`, `missing-edge`, `missing-blocking-trap`, `missing-recommended-skill`, `unexpected-empty-graph`

**Recommendation**:
- Consider documenting the relationship between `governance.ts` and `assertions.ts` to clarify which module is the source of truth

---

### 6. `evals/retrieval/scenarios/core/retrieval-core-scenarios.ts`

**Purpose**: Core-tier evaluation scenarios with fixture definitions.

**Strengths**:
- Rich scenario coverage: ranked hits, mixed visibility, bucket shape, profile hints, graph-plan selected, graph-plan governance, graph-plan orchestration
- `coreGraphPlanOrchestrationScenario` tests order dependencies between skills
- `coreGraphPlanGovernanceScenario` tests cross-team and security-level filtering
- Complete fixture definitions including `graphIndexDocuments` for v3 scenarios

**Observations**:
- Scenarios are well-structured with clear actor context and fixture state
- Graph index documents include nodes, edges, evidence, and timestamps
- Tests realistic governance scenarios (cross-team, high-security filtering)

**No issues found.**

---

### 7. `evals/retrieval/datasets/smoke/v3-graph-plan-smoke.ts`

**Purpose**: Smoke-tier v3 graph-plan test cases.

**Strengths**:
- Three focused cases: selected plan, v2 fallback, v1 fallback
- `v3GraphPlanSelectedSmoke` tests structural expectations with mitigates edge
- Fallback cases test routing decisions without structural assertions (appropriate for fallback scenarios)

**Observations**:
- Cases are appropriately minimal for smoke testing
- Tags enable filtering: `['smoke', 'v3', 'graph-plan', 'selected', 'structure', 'mitigates-edge']`

**No issues found.**

---

### 8. `evals/retrieval/datasets/core/v3-graph-plan-core.ts`

**Purpose**: Core-tier v3 graph-plan test cases.

**Strengths**:
- Three comprehensive cases: selected, governance, orchestration
- `v3GraphPlanSelectedCore` tests multi-hit ranking with skill dependencies (requires edge)
- `v3GraphPlanGovernanceCore` tests forbidden ID filtering
- `v3GraphPlanOrchestrationCore` tests order edge between skills

**Observations**:
- Graph-plan expectations are comprehensive: trap nodes, skill nodes, edges, blocking traps, recommended skills
- Tests different edge types: `mitigates`, `requires`, `order`

**No issues found.**

---

### 9. `evals/retrieval/run.ts`

**Purpose**: Evaluation runner entry point.

**Strengths**:
- Clean CLI argument parsing with sensible defaults
- Support for dry-run, allow-empty, endpoint filtering, JSON output
- Baseline comparison and write functionality (Phase 29-03)
- Isolated execution contexts prevent fixture bleeding
- Clear pass/fail exit codes

**Observations**:
- `executeAllCases` integrates governance, metrics, and graph-plan structural assertions
- `aggregateSliceMetrics` provides comprehensive slice-level aggregation
- Baseline comparison uses 0.05 threshold for regression detection

**No issues found.**

---

### 10. `evals/retrieval/lib/normalize.test.ts`

**Purpose**: Unit tests for normalization functions.

**Strengths**:
- Comprehensive coverage of v1, v2, and v3 normalizers
- Tests for graph-plan structure extraction: trap nodes, skill nodes, edges, focus metadata
- Tests for fallback responses (capsule and entry)
- Endpoint identity preservation tests

**Test Coverage**:
- v1 normalization: bucket handling, sorting, empty detection
- v2 normalization: capsule extraction, profile hints, empty bucket map
- v3 normalization: selected plan, capsule fallback, entry fallback
- Graph-plan structure: node IDs, edge types, focus metadata, fallback undefined structure

**No issues found.**

---

## Cross-Cutting Concerns

### Architecture Quality

1. **Separation of Concerns**: Clear layers for contracts, types, normalization, assertions, and execution
2. **Schema-First Design**: Zod schemas provide runtime validation and type inference
3. **Extensibility**: Easy to add new endpoints, edge types, or assertion kinds

### Code Quality

1. **Type Safety**: Strong typing throughout with explicit interfaces
2. **Error Handling**: Graceful handling of missing structure, empty responses, fallback scenarios
3. **Documentation**: Comprehensive JSDoc comments explaining purpose and design decisions

### Test Coverage

1. **Unit Tests**: `normalize.test.ts` provides thorough coverage of normalization logic
2. **Integration Tests**: Scenarios and datasets provide end-to-end coverage
3. **Edge Cases**: Tests cover empty responses, fallback responses, missing structure

---

## Recommendations

### 1. Clarify Governance vs Assertions Relationship

**Issue**: `governance.ts` and `assertions.ts` have overlapping functionality.

**Recommendation**: Document which module is the source of truth, or consolidate into a single module with clear sections.

### 2. Add Missing Test Coverage

**Observation**: No tests found for `governance.ts` or `assertions.ts`.

**Recommendation**: Add unit tests for:
- `evaluateGovernance` function
- `assertGraphPlanStructure` function
- `evaluateVerdicts` function

### 3. Consider Scenario-to-Case Validation

**Observation**: Cases reference `scenarioId` but no validation ensures the scenario exists.

**Recommendation**: Add a validation step in `loadCases` or a separate lint rule to verify scenario references.

### 4. Add Graph-Plan Assertion Tests

**Observation**: `assertGraphPlanStructure` has no dedicated unit tests.

**Recommendation**: Create `assertions.test.ts` with test cases for:
- Missing trap nodes
- Missing skill nodes
- Missing edges
- Missing blocking traps
- Missing recommended skills
- Unexpected empty graph

---

## Summary

The retrieval evaluation framework is well-designed with strong architectural foundations. The v3 graph-plan evaluation support integrates seamlessly with the existing v1/v2 infrastructure. The normalization layer handles all three endpoints cleanly, and the assertion layer provides comprehensive structural validation for graph-plan responses.

**Strengths**:
- Clean contract definitions via Zod schemas
- Comprehensive normalization for v1, v2, v3 endpoints
- Rich governance and structural assertions
- Well-designed scenarios and datasets

**Areas for Improvement**:
- Clarify relationship between governance.ts and assertions.ts
- Add missing unit tests for governance and assertion functions
- Add scenario reference validation

**Overall Assessment**: Ready for production use with minor improvements recommended.
