# Phase 26 Review: Retrieval Metrics, Runner, and Governance Checks

## Overview

This review covers the implementation of the retrieval evaluation runner infrastructure including metrics calculation, governance assertions, report generation, and execution adapters.

**Files Reviewed:**
- `evals/retrieval/lib/adapters.ts` - Endpoint execution adapters
- `evals/retrieval/lib/assertions.ts` - First-class verdict evaluation
- `evals/retrieval/lib/format.ts` - Terminal formatting
- `evals/retrieval/lib/governance.ts` - Governance assertion layer
- `evals/retrieval/lib/load.ts` - Case loading and validation
- `evals/retrieval/lib/metrics.ts` - Ranking metric calculators
- `evals/retrieval/lib/normalize.ts` - Response normalization
- `evals/retrieval/lib/report.ts` - Canonical report builder
- `evals/retrieval/lib/types.ts` - Shared type definitions
- `evals/retrieval/README.md` - Documentation
- `evals/retrieval/runner.test.ts` - Runner tests
- `evals/retrieval/run.ts` - Main runner entrypoint
- `package.json` - Package scripts
- `packages/contracts/src/domain/evals/report.ts` - Report contract schema
- `packages/contracts/src/index.ts` - Contracts barrel export

---

## Architecture Assessment

### Strengths

1. **Clean Separation of Concerns**: The codebase demonstrates excellent modular design:
   - `adapters.ts` handles execution boundary
   - `normalize.ts` handles response normalization
   - `metrics.ts` handles ranking calculations
   - `governance.ts` handles policy assertions
   - `assertions.ts` handles first-class verdicts
   - `report.ts` handles canonical report building
   - `format.ts` handles terminal output

2. **Single Source of Truth**: Both JSON and terminal output derive from a canonical `RetrievalEvalReport` structure, ensuring consistency.

3. **Type Safety**: All types are defined in `types.ts` and validated through Zod schemas in the contracts package.

4. **Empty Target Policy**: Metrics correctly return 0 when no relevant IDs exist, with the policy explicitly documented and serializable.

5. **Verdict-First Governance**: Phase 26-02 correctly elevates governance to first-class verdicts, separate from ranking metrics.

### Design Patterns

- **Adapter Pattern**: `adapters.ts` provides a clean execution boundary between the runner and actual endpoints
- **Normalizer Pattern**: `normalize.ts` transforms v1 bucketed and v2 capsule responses into a common shape
- **Builder Pattern**: `report.ts` builds the canonical report from case results
- **Strategy Pattern**: Different normalization strategies for v1 vs v2 endpoints

---

## File-by-File Analysis

### `evals/retrieval/lib/adapters.ts`

**Purpose**: Execution boundary for running eval cases against endpoints.

**Key Components**:
- `ExecutionContext` - Holds app, store, and session token
- `createExecutionContext()` - Sets up in-process Fastify server with test store
- `executeThroughRoute()` - Executes via Fastify inject()
- `executeCase()` - Main entry point

**Observations**:
- Uses ephemeral JSON store files in `/tmp` for isolation
- Creates system-admin session for eval runner
- Handles both server errors (500+) and client errors (400+) gracefully
- Returns empty results on errors with appropriate warnings
- Line 75: `app.skillShareer.store` appears to be a typo (should likely be `skillSharer`)

**Potential Issue**:
```typescript
const store = app.skillShareer.store;  // Line 75
```
This property name looks like a typo. If this works in tests, the server may have this typo as well.

### `evals/retrieval/lib/assertions.ts`

**Purpose**: First-class verdict evaluation (Phase 26-02).

**Key Components**:
- `VerdictKind` - 'governance' | 'outcome' | 'shape' | 'execution'
- `Verdict` - Single pass/fail decision with optional failure
- `CaseVerdicts` - Complete verdict set for a case
- `evaluateVerdicts()` - Main evaluation function

**Observations**:
- Clean separation of verdict kinds
- `assertExecutionSuccess()` correctly distinguishes degraded vs non-degraded warnings
- Helper functions (`hasGovernanceFailure`, `hasOutcomeMismatch`, `hasExecutionIssue`) provide convenient predicates

**Quality**: Excellent. The verdict system is well-designed and provides explicit traceability.

### `evals/retrieval/lib/format.ts`

**Purpose**: Human-readable terminal formatting.

**Key Components**:
- `formatReport()` - Full terminal output
- `formatSliceSummary()` - Per-slice metrics
- `formatFailure()` - Failure record
- `formatWarning()` - Warning record
- `formatCompactSummary()` - CI-friendly single-line format

**Observations**:
- Properly categorizes failures by kind (governance, outcome, execution)
- Only shows warnings with `degraded: true`
- Compact summary uses first slice for metrics (reasonable for single-tier runs)

**Quality**: Good. Clear, readable output format.

### `evals/retrieval/lib/governance.ts`

**Purpose**: Legacy governance assertion layer.

**Key Components**:
- `checkForbiddenHits()` - Detects forbidden IDs in results
- `checkUnexpectedEmpty()` / `checkUnexpectedNonEmpty()` - Outcome validation
- `checkV1BucketShape()` - v1 bucket expectations
- `checkV2ProfileHints()` / `checkV2CapsuleCount()` - v2 shape expectations
- `evaluateGovernance()` - Main evaluation

**Observations**:
- Kept for backward compatibility alongside `assertions.ts`
- Duplicates some logic from assertions.ts (could be refactored to share)
- Correctly checks endpoint-specific shape expectations

**Note**: There's some duplication between this and `assertions.ts`. The code comment indicates this is kept for compatibility.

### `evals/retrieval/lib/load.ts`

**Purpose**: Case loading and validation.

**Key Components**:
- `loadCases()` - Loads and validates cases for a tier
- `loadScenario()` - Loads scenario by ID
- `filterByEndpoint()` / `filterByTags()` - Filtering utilities
- `getSliceKey()` / `getUniqueSliceKeys()` - Slice key extraction

**Observations**:
- Validates each case against `retrievalEvalCaseSchema`
- Imports from `smoke.js` and `core.js` for tier data
- Proper error handling with console.error before throw

**Quality**: Clean, focused module.

### `evals/retrieval/lib/metrics.ts`

**Purpose**: Ranking metric calculators.

**Key Components**:
- `hitAtK()` - Hit@K metric
- `mrr()` - Mean Reciprocal Rank
- `ndcg()` - Normalized Discounted Cumulative Gain
- `recallAtK()` - Recall@K metric
- `calculateMetrics()` - Combined metrics calculation
- `averageMetrics()` - Aggregate across cases

**Mathematical Correctness**:
- Hit@K: Returns 1 if any relevant ID in top K, 0 otherwise (correct)
- MRR: Returns 1/rank of first relevant, 0 if none (correct)
- nDCG: Uses binary relevance with proper log2(rank+1) discount (correct)
- Recall@K: Fraction of relevant items in top K (correct)

**Empty Target Policy**: All metrics return 0 when `relevantIds.length === 0` (correct)

**Quality**: Excellent. Mathematically correct implementations.

### `evals/retrieval/lib/normalize.ts`

**Purpose**: Endpoint-specific response normalization.

**Key Components**:
- `normalizeV1Response()` - v1 bucketed response normalization
- `normalizeV2Response()` - v2 capsule-first normalization
- `normalizeResponse()` - Dispatcher based on endpoint
- `extractV1Ids()` / `extractV2CapsuleIds()` / `extractV2ProfileHintArtifactIds()` - ID extraction helpers

**Observations**:
- v1: Combines globalConstraints and projectKnowledge, sorts by score descending
- v2: Preserves capsule order from server (already sorted)
- Endpoint identity preserved in result for diagnostics

**Quality**: Clean abstraction over endpoint differences.

### `evals/retrieval/lib/report.ts`

**Purpose**: Canonical report builder.

**Key Components**:
- `buildReport()` - Main builder function
- `buildSliceSummaries()` / `buildSliceSummary()` - Slice aggregation
- `buildCaseSummary()` - Per-case summary
- `buildFailureRecords()` - Failure extraction
- `buildWarningRecords()` - Warning extraction

**Observations**:
- Validates through `retrievalEvalReportSchema.parse()`
- Stable sorting: slices by tier/endpoint/mode, cases by caseId, failures by caseId then kind
- Correctly maps internal failure kinds to report failure kinds

**Quality**: Excellent. Single source of truth for reports.

### `evals/retrieval/lib/types.ts`

**Purpose**: Shared type definitions.

**Key Components**:
- Execution types: `AdapterType`, `ExecutionMetadata`, `AdapterWarning`
- Result types: `NormalizedHit`, `BucketMap`, `NormalizedResult`
- Governance types: `GovernanceFailureKind`, `GovernanceFailure`, `GovernanceResult`
- Metric types: `CaseMetrics`, `SliceKey`, `SliceMetrics`
- Verdict types: `VerdictKind`, `Verdict`, `CaseVerdicts`
- Result types: `CaseResult`
- Runner types: `RunnerOptions`, `RunnerSummary`

**Observations**:
- Comprehensive type coverage
- Imports from contracts for shared types
- Phase annotations in comments (REVAL-01, REVAL-03, etc.)

**Quality**: Well-organized type definitions.

### `evals/retrieval/runner.test.ts`

**Purpose**: Tests for retrieval runner.

**Test Categories**:
- Case loading: Validates smoke and core tier loading
- Execution context: Validates context creation and session authentication
- Endpoint execution: Validates v1 and v2 execution
- Governance evaluation: Validates forbidden hit detection and outcome matching
- Metrics calculation: Validates metric computation

**Observations**:
- Uses vitest with proper beforeEach/afterEach for context cleanup
- Tests exercise real code paths through Fastify inject()
- Governance tests use inline test cases with expected outcomes

**Coverage Gaps**:
- No tests for report building
- No tests for formatting
- No tests for verdict evaluation in assertions.ts
- No negative test cases for metrics edge cases

**Recommendation**: Add tests for report.ts, format.ts, and assertions.ts modules.

### `evals/retrieval/run.ts`

**Purpose**: Main runner entrypoint.

**Key Components**:
- `parseArgs_()` - Command-line argument parsing
- `filterByEndpoint_()` - Endpoint filtering
- `executeAllCases()` - Case execution loop
- `main()` - Entry point

**Observations**:
- Uses Node's built-in `parseArgs` for CLI parsing
- Proper error handling with process.exit(1) on failures
- Supports --dry-run, --allow-empty, --json, --json-path, --verbose
- Phase 26-02 correctly uses verdicts for pass/fail determination

**Quality**: Clean, well-structured entrypoint.

### `packages/contracts/src/domain/evals/report.ts`

**Purpose**: Report contract schema.

**Key Components**:
- `retrievalEvalReportMetaSchema` - Report metadata
- `retrievalEvalFailureKindSchema` - Failure kind enum
- `retrievalEvalFailureRecordSchema` - Single failure
- `retrievalEvalWarningRecordSchema` - Warning record
- `retrievalEvalSliceKeySchema` / `retrievalEvalSliceSummarySchema` - Slice types
- `retrievalEvalCaseSummarySchema` - Case summary
- `retrievalEvalReportSchema` - Full report
- `ReportBuilderInput` - Interface for builder input

**Observations**:
- All fields properly constrained (e.g., metrics bounded to [0,1])
- Uses Zod for runtime validation
- Schema version 1 literal for future compatibility

**Quality**: Robust schema definitions.

### `packages/contracts/src/index.ts`

**Purpose**: Barrel export for contracts.

**Observations**:
- Exports from `domain/evals/report.js`
- Clean separation of domain modules

---

## Integration Assessment

### Cross-Module Dependencies

```
run.ts
  ├── load.ts → smoke.js, core.js, contracts
  ├── adapters.ts → server, normalize.ts
  ├── governance.ts → types.ts
  ├── assertions.ts → types.ts
  ├── metrics.ts → types.ts
  ├── report.ts → contracts/report.ts, types.ts
  └── format.ts → contracts/report.ts
```

**Assessment**: Clean dependency graph with no circular dependencies.

### Contracts Integration

The contracts package correctly exports all necessary types and schemas:
- `RetrievalEvalCase`, `RetrievalEvalTier`, `RetrievalEvalEndpoint`
- `RetrievalEvalReport` and related types
- `retrievalEvalCaseSchema`, `retrievalEvalReportSchema`

---

## Identified Issues

### 1. Potential Typo in adapters.ts

**Location**: `evals/retrieval/lib/adapters.ts:75`

```typescript
const store = app.skillShareer.store;
```

**Issue**: `skillShareer` appears to be a typo for `skillSharer`.

**Recommendation**: Verify the server's actual property name and fix if confirmed as typo.

### 2. Code Duplication: governance.ts vs assertions.ts

**Issue**: Both modules implement similar governance checks:
- `checkForbiddenHits()` in governance.ts
- `assertNoForbiddenHits()` in assertions.ts

**Recommendation**: Consider having governance.ts delegate to assertions.ts or share common functions.

### 3. Missing Test Coverage

**Gaps**:
- No tests for `report.ts`
- No tests for `format.ts`
- No tests for `assertions.ts` verdict evaluation
- No edge case tests for metrics (e.g., empty returnedIds, duplicate IDs)

**Recommendation**: Add dedicated test files:
- `report.test.ts`
- `format.test.ts`
- `assertions.test.ts`
- Additional edge cases in `metrics.test.ts`

### 4. Error Handling in load.ts

**Location**: `evals/retrieval/lib/load.ts:35-38`

```typescript
} catch (error) {
  console.error(`Invalid case in ${tier} tier:`, error);
  throw error;
}
```

**Issue**: Console.error before throw may produce duplicate output if caller also logs.

**Recommendation**: Consider using a custom error type with context, letting caller decide on logging.

---

## Compliance with Phase Objectives

### Phase 26-01: Execution Substrate

| Objective | Status | Notes |
|-----------|--------|-------|
| Adapters execute through routes | ✅ | `executeThroughRoute()` uses Fastify inject() |
| Normalization for v1/v2 | ✅ | `normalize.ts` handles both |
| Metrics calculators | ✅ | Hit@K, MRR, nDCG, Recall@K implemented |
| Governance checks | ✅ | Forbidden hits, outcome, shape checks |

### Phase 26-02: Canonical Reports

| Objective | Status | Notes |
|-----------|--------|-------|
| Machine-readable JSON report | ✅ | `RetrievalEvalReport` schema |
| Terminal output | ✅ | `formatReport()` derives from report |
| Slice aggregation | ✅ | By tier/endpoint/mode |
| Failure records | ✅ | Categorized by kind |
| First-class verdicts | ✅ | `assertions.ts` implementation |

---

## Summary

### Overall Assessment: **Strong**

The implementation demonstrates:
- Excellent modular architecture
- Proper type safety through Zod schemas
- Correct mathematical implementations for metrics
- Clean separation of governance from ranking
- Single source of truth for reports

### Critical Issues: 0

No blocking issues found.

### Recommended Improvements

1. **Fix potential typo**: Verify `skillShareer` property name
2. **Reduce duplication**: Consolidate governance.ts and assertions.ts
3. **Expand test coverage**: Add tests for report.ts, format.ts, assertions.ts
4. **Improve error handling**: Use custom error types in load.ts

### Phase Completion Status

Phase 26 appears complete with all planned functionality implemented. The code is production-ready with minor improvements recommended.
