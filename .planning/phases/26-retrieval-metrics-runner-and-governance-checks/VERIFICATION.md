# Phase 26 Verification: Retrieval Metrics Runner and Governance Checks

**Phase:** 26-retrieval-metrics-runner-and-governance-checks
**Goal:** Implement retrieval evaluation runner with governance checks, per-slice reporting, and regression-friendly output
**Verified:** 2026-04-21

---

## Requirements Traceability

| Requirement | Phase Plan | Status | Evidence |
|-------------|------------|--------|----------|
| **REVAL-01** | 26-01, 26-02 | ✅ Complete | Maintainer-facing CLI via `pnpm eval:retrieval` scripts in package.json |
| **REVAL-03** | 26-01, 26-02 | ✅ Complete | `evals/retrieval/lib/metrics.ts` implements Hit@K, MRR, nDCG, Recall@K |
| **REVAL-04** | 26-02 | ✅ Complete | `evals/retrieval/lib/assertions.ts` and `governance.ts` detect governance failures |

### Cross-Reference to REQUIREMENTS.md

Per REQUIREMENTS.md traceability table:
- REVAL-01: Phase 25, Phase 26 → Complete ✅
- REVAL-03: Phase 26 → Pending → Now Complete ✅
- REVAL-04: Phase 26, Phase 29 → Pending → Partially complete (Phase 26 portion done) ✅

---

## Must-Haves Verification: Plan 26-01

### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| "Maintainers can run retrieval evaluation from root pnpm scripts without ad-hoc setup." | ✅ | `package.json` defines `eval:retrieval`, `eval:retrieval:smoke`, `eval:retrieval:core`, `eval:retrieval:dry-run` |
| "The runner executes Phase 25 golden cases through explicit endpoint adapters instead of a dry-run-only path." | ✅ | `evals/retrieval/lib/adapters.ts` implements `executeCase()` using Fastify `inject()` for route-faithful execution |
| "v1 bucketed responses and v2 capsule-first responses normalize into one scored result shape without erasing endpoint identity." | ✅ | `evals/retrieval/lib/normalize.ts` has `normalizeV1Response()` and `normalizeV2Response()` both returning `NormalizedResult` with endpoint preserved |
| "Hit@K, MRR, nDCG, and Recall@K compute deterministically per evaluation slice." | ✅ | `evals/retrieval/lib/metrics.ts` implements all four metrics with binary relevance and zero empty-target policy |

### Artifacts

| Artifact | Status | Provides | Contains |
|----------|--------|----------|----------|
| `evals/retrieval/run.ts` | ✅ Exists | Maintainer-facing CLI | Real execution path, CLI flags, report emission |
| `evals/retrieval/lib/adapters.ts` | ✅ Exists | Endpoint execution boundary | `ExecutionContext`, `executeCase()`, adapter metadata |
| `evals/retrieval/lib/normalize.ts` | ✅ Exists | Response normalization | `normalizeV1Response()`, `normalizeV2Response()` |
| `evals/retrieval/lib/metrics.ts` | ✅ Exists | Ranking metrics | `hitAtK()`, `mrr()`, `ndcg()`, `recallAtK()` |
| `evals/retrieval/lib/types.ts` | ✅ Exists | Shared types | `CaseResult`, `SliceKey`, `NormalizedResult`, `ExecutionMetadata` |
| `package.json` | ✅ Modified | Root scripts | `eval:retrieval*` scripts |

### Key Links

| Link | Status | Evidence |
|------|--------|----------|
| `packages/contracts/src/domain/evals/retrieval.ts` → `evals/retrieval/lib/load.ts` via `retrievalEvalCaseSchema` | ✅ | `load.ts` imports and uses `retrievalEvalCaseSchema` for validation |
| `packages/server/src/app.ts` → `evals/retrieval/lib/adapters.ts` via `buildServer` | ✅ | `adapters.ts` imports `buildServer` and creates in-process Fastify app |
| `packages/contracts/src/domain/retrieval.ts` → `evals/retrieval/lib/normalize.ts` via response types | ✅ | `normalize.ts` imports `RetrievalResponse`, `RetrievalV2ResponseWithHints` |
| `evals/retrieval/lib/normalize.ts` → `evals/retrieval/lib/metrics.ts` via `resultIds` | ✅ | `calculateMetrics()` accepts `NormalizedResult.returnedIds` |

---

## Must-Haves Verification: Plan 26-02

### Truths

| Truth | Status | Evidence |
|-------|--------|----------|
| "Governance failures surface explicitly and independently from ranking metrics." | ✅ | `evals/retrieval/lib/assertions.ts` implements `evaluateVerdicts()` with separate `governance`, `outcome`, `shape`, `execution` verdict kinds |
| "Per-slice summaries show endpoint, tier, and mode breakdowns suitable for regression review." | ✅ | `evals/retrieval/lib/report.ts` builds `RetrievalEvalSliceSummary` grouped by `{tier, endpoint, mode}` |
| "The retrieval evaluator emits both machine-readable and human-readable output from one canonical report structure." | ✅ | `buildReport()` creates single `RetrievalEvalReport`; `formatReport()` derives terminal output from same structure |
| "Compatibility warnings and fallback execution details remain visible in reports instead of being silently swallowed." | ✅ | `AdapterWarning` type and `buildWarningRecords()` include warnings in report; `format.ts` shows degraded warnings |

### Artifacts

| Artifact | Status | Provides | Contains |
|----------|--------|----------|----------|
| `evals/retrieval/lib/assertions.ts` | ✅ Exists | Governance assertions | `evaluateVerdicts()`, forbidden-hit/outcome/shape checks |
| `evals/retrieval/lib/report.ts` | ✅ Exists | Canonical report builder | `buildReport()`, slice aggregation, failure records |
| `evals/retrieval/lib/format.ts` | ✅ Exists | Terminal formatting | `formatReport()`, `formatSliceSummary()`, `formatCompactSummary()` |
| `packages/contracts/src/domain/evals/report.ts` | ✅ Exists | Machine-readable schema | `retrievalEvalReportSchema` with Zod validation |
| `evals/retrieval/run.ts` | ✅ Modified | CLI flags | `--json`, `--json-path` options for machine-readable output |

### Key Links

| Link | Status | Evidence |
|------|--------|----------|
| `evals/retrieval/lib/types.ts` → `evals/retrieval/lib/assertions.ts` via `CaseVerdicts` | ✅ | `assertions.ts` imports `NormalizedResult`, `GovernanceFailure`, `GovernanceResult` |
| `evals/retrieval/lib/assertions.ts` → `evals/retrieval/lib/report.ts` via verdict aggregation | ✅ | `report.ts` uses `result.verdicts` in `buildCaseSummary()` and `buildFailureRecords()` |
| `packages/contracts/src/domain/evals/report.ts` → `evals/retrieval/run.ts` via JSON validation | ✅ | `report.ts` uses `retrievalEvalReportSchema.parse()` for validation |

---

## Test Verification

```
Test Files  6 passed (6)
     Tests  105 passed (105)
  Duration  1.06s
```

Test files cover:
- `evals/retrieval/runner.test.ts` - Runner execution and governance
- `evals/retrieval/lib/assertions.test.ts` - Verdict evaluation
- `evals/retrieval/lib/report.test.ts` - Report building and formatting
- Additional metric, normalization, and adapter tests

---

## Summary Claims vs Actual

### Plan 26-01 Summary Claims

| Claim | Verified |
|-------|----------|
| "Maintainers can run retrieval evaluation via root `pnpm` scripts" | ✅ |
| "v1 and v2 responses normalize into one shared comparable result structure" | ✅ |
| "Hit@K, MRR, nDCG, and Recall@K compute deterministically per evaluation slice" | ✅ |
| "Governance failures surface forbidden hits, unexpected empty/non-empty outcomes, and shape mismatches explicitly" | ✅ |

### Plan 26-02 Summary Claims

| Claim | Verified |
|-------|----------|
| "Governance failures surface explicitly as first-class verdicts, separate from ranking metrics" | ✅ |
| "Per-slice summaries show endpoint, tier, and mode breakdowns suitable for regression review" | ✅ |
| "Retrieval evaluator emits both machine-readable JSON and human-readable terminal output from one canonical report" | ✅ |
| "Compatibility warnings and fallback execution details remain visible in reports" | ✅ |

---

## Phase Goal Achievement

**Goal:** Implement retrieval evaluation runner with governance checks, per-slice reporting, and regression-friendly output

| Component | Status | Implementation |
|-----------|--------|----------------|
| Retrieval evaluation runner | ✅ Complete | `evals/retrieval/run.ts` with CLI flags |
| Governance checks | ✅ Complete | `evals/retrieval/lib/assertions.ts`, `governance.ts` |
| Per-slice reporting | ✅ Complete | `evals/retrieval/lib/report.ts` with slice aggregation |
| Regression-friendly output | ✅ Complete | JSON reports via `--json`, stable slice keys, sorted records |

---

## Outstanding Items

None. Phase 26 is complete.

### Future Phases

Per REQUIREMENTS.md:
- **REVAL-04** has a Phase 29 component (baseline and failure policy) remaining
- **SEVAL-01/02** (Summary Evaluation) → Phase 27
- **EOPS-01/02/03** (Operations and Regression Control) → Phase 28

---

## Verification Summary

| Category | Result |
|----------|--------|
| Requirements coverage | 3/3 mapped requirements complete |
| Must-haves (26-01) | 4/4 truths, 6/6 artifacts, 4/4 key links |
| Must-haves (26-02) | 4/4 truths, 5/5 artifacts, 3/3 key links |
| Tests | 105/105 passing |
| Goal achievement | ✅ Complete |

**Phase 26 Status: ✅ VERIFIED COMPLETE**

---

*Verified: 2026-04-21*
