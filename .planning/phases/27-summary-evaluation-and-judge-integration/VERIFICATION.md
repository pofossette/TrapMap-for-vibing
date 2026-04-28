---
phase: 27-summary-evaluation-and-judge-integration
verified: 2026-04-28T15:05:00Z
status: partial
requirements_verified:
  - SEVAL-02
  - SEVAL-01-partial
---

# Phase 27 Verification: Summary Evaluation and Judge Integration

**Phase scope:** Add summary/refinement evaluation that checks groundedness, coverage, and citation adherence against retrieved context.

**Verification date:** 2026-04-28 (backfilled from current codebase evidence)
**Plans verified:** 27-01, 27-02

---

## Executive Summary

Phase 27 is **PARTIALLY VERIFIED**. The summary evaluation system implements groundedness scoring, coverage scoring, and forbidden claims detection. However:

- **SEVAL-02 is fully verified** -- evaluation cases define required facts and forbidden claims
- **SEVAL-01 is partial** -- groundedness and coverage are implemented, but citation adherence is not a first-class failure kind

The core tier remains empty (`evals/summary/core.ts` exports `[]`). The report schema and verdict surface do not expose citation adherence as a separate metric.

---

## Requirement Traceability

| Requirement | Aspect | Status | Evidence |
|-------------|--------|--------|----------|
| SEVAL-01 | Groundedness scoring | **VERIFIED** | `evals/summary/lib/groundedness.ts`, `groundednessScore` in report |
| SEVAL-01 | Coverage scoring | **VERIFIED** | `evals/summary/lib/coverage.ts`, `coverageScore` in report |
| SEVAL-01 | Citation adherence | **NOT SIGNABLE** | Not a first-class failure kind in `summaryEvalFailureKindSchema`; extracted but not tracked separately |
| SEVAL-02 | Required facts in cases | **VERIFIED** | `summaryEvalExpectedSchema.requiredFacts` in contracts |
| SEVAL-02 | Forbidden claims in cases | **VERIFIED** | `summaryEvalExpectedSchema.forbiddenClaims` in contracts |
| SEVAL-02 | Hallucination visibility | **VERIFIED** | `forbiddenClaimsFound` array in report |

---

## Capability Verification

### Plan 27-01: Schemas and Datasets

| Capability | Evidence | Status |
|------------|----------|--------|
| Summary eval case schema | `packages/contracts/src/domain/evals/summary.ts`: `summaryEvalCaseSchema` | **IMPLEMENTED** |
| Required facts field | `summaryEvalExpectedSchema.requiredFacts: z.array(z.string().min(1))` | **IMPLEMENTED** |
| Forbidden claims field | `summaryEvalExpectedSchema.forbiddenClaims: z.array(z.string().min(1))` | **IMPLEMENTED** |
| Report schema | `packages/contracts/src/domain/evals/report.ts`: `summaryEvalReportSchema` | **IMPLEMENTED** |
| Smoke-tier scenarios | `evals/summary/scenarios/smoke/summary-smoke-scenarios.ts` (3 scenarios) | **IMPLEMENTED** |
| Smoke-tier cases | `evals/summary/datasets/smoke/summary-smoke.ts` (3 cases) | **IMPLEMENTED** |
| Core-tier cases | `evals/summary/core.ts`: `export const coreCases: SummaryEvalCase[] = [];` | **EMPTY PLACEHOLDER** |

### Plan 27-02: Runner and Judge

| Capability | Evidence | Status |
|------------|----------|--------|
| Summary evaluation runner | `evals/summary/run.ts`: CLI with `--tier`, `--dry-run`, `--provider` options | **IMPLEMENTED** |
| Fallback judge | `evals/summary/lib/judge.ts`: `fallbackJudge()` with substring matching | **IMPLEMENTED** |
| Groundedness scoring | `evals/summary/lib/groundedness.ts`: `calculateGroundednessScore()` | **IMPLEMENTED** |
| Coverage scoring | `evals/summary/lib/coverage.ts`: `calculateCoverageScore()` | **IMPLEMENTED** |
| Forbidden claims detection | `evals/summary/lib/judge.ts`: `fallbackCheckForbidden()` | **IMPLEMENTED** |
| Verdict assertions | `evals/summary/lib/assertions.ts`: `evaluateSummaryVerdicts()` | **IMPLEMENTED** |
| Report builder | `evals/summary/lib/report.ts`: `buildSummaryReport()` | **IMPLEMENTED** |
| Terminal formatting | `evals/summary/lib/format.ts`: `formatSummaryReport()` | **IMPLEMENTED** |

---

## Citation Adherence Gap Analysis

SEVAL-01 states: "scores groundedness, coverage, and citation adherence."

**What exists:**

- `evals/summary/lib/claims.ts`: `extractClaims()` and `extractCitations()` functions detect `[N]` and `[citation:xxx]` patterns
- Claims are verified against context for groundedness scoring

**What is missing:**

- `summaryEvalFailureKindSchema` (in `packages/contracts/src/domain/evals/report.ts`) has no `citation-adherence` failure kind:
  ```typescript
  export const summaryEvalFailureKindSchema = z.enum([
    'groundedness-below-threshold',
    'coverage-below-threshold',
    'forbidden-claim-found',
    'missing-summary',
    'execution-error',
  ]);
  ```
- Citation extraction is used internally for groundedness but not tracked as a separate metric
- No `citationAdherenceScore` in `summaryEvalCaseResultSchema`
- Verdicts in `evals/summary/lib/assertions.ts` do not include a citation verdict kind

**Conclusion:** SEVAL-01 is not fully signable for citation adherence. The infrastructure exists (claim extraction, citation detection), but it is not surfaced as a first-class metric or failure kind.

---

## Test Coverage

From original Phase 27 execution:

```
 ✓ evals/summary/__tests__/claims.test.ts (14 tests)
 ✓ evals/summary/__tests__/judge.test.ts (13 tests)
 ✓ evals/summary/__tests__/scoring.test.ts (16 tests)

 Test Files  3 passed (3)
      Tests  43 passed (43)
```

---

## Empty Core Tier

`evals/summary/core.ts` currently exports an empty array:

```typescript
export const coreCases: SummaryEvalCase[] = [];
```

This is intentional per Phase 27 scope: smoke-tier cases validate the runner; core-tier cases can be added as needed for regression coverage.

---

## Scope Boundaries

Phase 27 does not include:

| Capability | Status |
|------------|--------|
| OpenAI LLM-as-judge integration | Placeholder exists; `--provider openai` requires `OPENAI_API_KEY` |
| Core-tier evaluation cases | Empty placeholder for future authoring |
| Citation adherence as first-class metric | Not surfaced in report or verdicts |
| Integration with unified runner | Phase 28 |

---

## Verification Summary

| Requirement | Aspect | Status |
|-------------|--------|--------|
| SEVAL-01 | Groundedness | **VERIFIED** |
| SEVAL-01 | Coverage | **VERIFIED** |
| SEVAL-01 | Citation adherence | **GAP** -- infrastructure exists, not surfaced as metric |
| SEVAL-02 | Required facts | **VERIFIED** |
| SEVAL-02 | Forbidden claims | **VERIFIED** |

**Phase 27 Status: PARTIALLY VERIFIED**

SEVAL-02 is complete. SEVAL-01 is partially signable -- groundedness and coverage are implemented, but citation adherence is not a distinct failure kind or report metric. The summary evaluator is functional for smoke-tier evaluation.

---

*Backfilled: 2026-04-28*
*Original verification: 2026-04-21*
