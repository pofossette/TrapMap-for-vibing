---
phase: 26-retrieval-metrics-runner-and-governance-checks
verified: 2026-04-28T15:00:00Z
status: verified
requirements_verified:
  - REVAL-01
  - REVAL-03
  - REVAL-04
---

# Phase 26 Verification: Retrieval Metrics Runner and Governance Checks

**Phase scope:** Implement retrieval evaluation runner with governance checks, per-slice reporting, and regression-friendly output.

**Verification date:** 2026-04-28 (backfilled from current codebase evidence)
**Plans verified:** 26-01, 26-02

---

## Executive Summary

Phase 26 is **VERIFIED** for capability delivery. The retrieval evaluator exists and functions:

- Runner executes cases through endpoint adapters
- Metrics compute deterministically (Hit@K, MRR, nDCG, Recall@K)
- Governance failures are detected and reported explicitly
- Canonical reports emit JSON and terminal output

**Distinction from pass/fail status:** Verification confirms the evaluator is implemented and operational. It does not claim that all evaluation cases pass. Case pass/fail status depends on the retrieval system under test, not the evaluator implementation.

---

## Requirement Traceability

| Requirement | Phase Plan | Status | Evidence |
|-------------|------------|--------|----------|
| REVAL-01 | 26-01, 26-02 | **VERIFIED** | Runner exists at `evals/retrieval/run.ts`; CLI via `pnpm eval:retrieval` |
| REVAL-03 | 26-01 | **VERIFIED** | `evals/retrieval/lib/metrics.ts` implements Hit@K, MRR, nDCG, Recall@K |
| REVAL-04 | 26-01, 26-02 | **VERIFIED** | `evals/retrieval/lib/governance.ts` and `lib/assertions.ts` detect forbidden hits, outcome mismatches, shape violations |

---

## Capability Verification

### Plan 26-01: Execution Substrate

| Capability | Evidence | Status |
|------------|----------|--------|
| Maintainer-facing CLI | `package.json` defines `eval:retrieval`, `eval:retrieval:smoke`, `eval:retrieval:core`, `eval:retrieval:dry-run` | **IMPLEMENTED** |
| Endpoint execution via Fastify inject() | `evals/retrieval/lib/adapters.ts`: `executeCase()` creates in-process server and injects HTTP requests | **IMPLEMENTED** |
| Response normalization | `evals/retrieval/lib/normalize.ts`: `normalizeV1Response()`, `normalizeV2Response()` return `NormalizedResult` with endpoint preserved | **IMPLEMENTED** |
| Ranking metrics | `evals/retrieval/lib/metrics.ts`: `hitAtK()`, `mrr()`, `ndcg()`, `recallAtK()` with binary relevance, zero empty-target policy | **IMPLEMENTED** |
| Governance assertion layer | `evals/retrieval/lib/governance.ts`: `evaluateGovernance()` checks forbiddenIds, outcome matches | **IMPLEMENTED** |

### Plan 26-02: Verdicts and Reporting

| Capability | Evidence | Status |
|------------|----------|--------|
| First-class verdicts | `evals/retrieval/lib/assertions.ts`: `evaluateVerdicts()` produces separate verdicts for governance, outcome, shape, execution | **IMPLEMENTED** |
| Per-slice summaries | `evals/retrieval/lib/report.ts`: slices grouped by `{tier, endpoint, mode}`, stable sort order | **IMPLEMENTED** |
| Canonical report schema | `packages/contracts/src/domain/evals/report.ts`: `retrievalEvalReportSchema` with Zod validation | **IMPLEMENTED** |
| JSON and terminal output | `evals/retrieval/run.ts`: `--json`, `--json-path` options; `printSummary()` for terminal | **IMPLEMENTED** |

---

## Test Coverage

From original Phase 26 execution:

```
Test Files  6 passed (6)
     Tests  105 passed (105)
```

Test files include:
- `evals/retrieval/runner.test.ts` -- runner execution and governance
- `evals/retrieval/lib/assertions.test.ts` -- verdict evaluation
- `evals/retrieval/lib/report.test.ts` -- report building and formatting
- Metric, normalization, and adapter tests

---

## Key Design Properties Verified

1. **Adapter pattern isolates execution.** `lib/adapters.ts` wraps Fastify inject() for route-faithful in-process calls.

2. **Binary relevance with deterministic behavior.** All metrics return 0 when no relevant IDs exist (zero empty-target policy).

3. **Normalize after execution, not before.** Endpoint-specific response details (buckets for v1, capsules for v2) preserved in `NormalizedResult`.

4. **Hard governance assertions.** Forbidden hits and shape mismatches produce explicit failures, not soft metric penalties.

5. **Stable slice keys.** Slices sorted by `{tier, endpoint, mode}` for regression comparison.

---

## Scope Boundaries

Phase 26 does not include:

| Capability | Delivered By |
|------------|-------------|
| Baseline write/compare flow | Phase 29-03 (EOPS-03) |
| v3 endpoint cases | Later phases (see `evals/retrieval/README.md`) |
| Cohort aggregation by query type | Phase 31-01 (EOPS-01) |
| Mode comparison and routing distribution | Phase 31-02 (EOPS-01) |

---

## Live Case Status

The evaluator exists and detects failures. Current case pass/fail status is separate from evaluator capability:

- Red smoke cases would indicate retrieval system issues, not evaluator bugs
- Governance failures in reports reflect actual policy violations, not evaluator errors
- The evaluator correctly distinguishes between runner errors and case failures

---

## Downstream Enhancements

The `evals/retrieval/run.ts` runner was extended by later phases:

- Phase 29-03 added `--baseline` and `--write-baseline` options for EOPS-03
- Phase 30-03 added context trace fields for summary eval integration
- Phase 31 added cohort aggregation and routing distribution analysis

These extensions are visible in current code and do not retroactively become Phase 26 scope.

---

## Conclusion

Phase 26 delivered a functional retrieval evaluator with:
- Execution through endpoint adapters
- Deterministic ranking metrics
- First-class governance verdicts
- Canonical report structure

The evaluator is operational. Case pass/fail status is determined by the retrieval system under test.

---

*Backfilled: 2026-04-28*
*Original verification: 2026-04-21*
