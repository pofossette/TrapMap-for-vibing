---
phase: 29-rag-mode-routing
verified: 2026-04-28T15:15:00Z
status: verified
requirements_verified:
  - EOPS-03
operational_caveats:
  - ci-workflow-defects-deferred
---

# Phase 29 Verification: RAG Mode Routing (EOPS-03)

**Phase scope:** Unify v1/v2 retrieval behind a shared deterministic routing layer with governance-first mode selection, stable routing traces, and baseline/failure-policy support for future regressions.

**Verification date:** 2026-04-28 (refreshed from current codebase evidence)
**Plans verified:** 29-01, 29-02, 29-03

---

## Executive Summary

Phase 29 is **VERIFIED** for EOPS-03 capability delivery. The baseline and failure-policy infrastructure exists:

- Baseline report schema with per-slice metrics
- Regression thresholds with tier-specific presets
- Baseline write/compare flow in retrieval runner
- Explicit failure policy distinguishing governance failures from ranking drift
- Routing trace metadata for regression attribution

**Operational caveat:** CI workflow health is a separate concern. Phase 28 defects (missing `id: eval`, smoke baseline upload gap) affect CI execution but do not invalidate the EOPS-03 capability that Phase 29 delivered. CI fixes are deferred to Phase 46.

---

## Requirement Definition

> **EOPS-03**: The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment

---

## Requirement Traceability

| Requirement | Phase 29 Contribution | Status | Evidence |
|-------------|----------------------|--------|----------|
| EOPS-03 | Baseline report schema | **VERIFIED** | `packages/contracts/src/domain/evals/report.ts`: `baselineReportSchema` with slices, cohorts, governance failures |
| EOPS-03 | Regression thresholds | **VERIFIED** | `packages/contracts/src/domain/evals/report.ts`: `regressionThresholdsSchema`, `TIER_THRESHOLDS` presets |
| EOPS-03 | Baseline write/compare flow | **VERIFIED** | `evals/retrieval/run.ts`: `--baseline`, `--write-baseline` options |
| EOPS-03 | CI baseline comparison | **VERIFIED** | `evals/scripts/eval-ci.ts`: `compareWithBaseline()`, `writeBaseline()` functions |
| EOPS-03 | Failure policy documentation | **VERIFIED** | `evals/retrieval/README.md`: governance leaks and empty-result mismatches always fail |

---

## Capability Verification

### Plan 29-01: Routing Vocabulary

| Capability | Evidence | Status |
|------------|----------|--------|
| `RetrievalStrategy` enum | `packages/contracts/src/domain/retrieval.ts`: `z.enum(['naive', 'local', 'global', 'hybrid', 'mix', 'auto'])` | **IMPLEMENTED** |
| `RouteFamily` enum | `packages/contracts/src/domain/retrieval.ts`: `z.enum(['entry', 'capsule'])` | **IMPLEMENTED** |
| `RoutingReason` enum | `packages/contracts/src/domain/retrieval.ts`: explicit-mode, auto-error-detected, auto-goal-query, etc. | **IMPLEMENTED** |
| `RoutingTrace` schema | `packages/contracts/src/domain/retrieval.ts`: selectedMode, routeFamily, routingReason, fallbackApplied, channelsUsed | **IMPLEMENTED** |
| `selectRetrievalStrategy()` | `packages/server/src/lib/retrieval/orchestrator.ts`: deterministic v1 router helper | **IMPLEMENTED** |
| `selectRetrievalStrategyV2()` | `packages/server/src/lib/retrieval/orchestrator.ts`: deterministic v2 router helper | **IMPLEMENTED** |

### Plan 29-02: Router Integration

| Capability | Evidence | Status |
|------------|----------|--------|
| Governance filtering tests | `packages/server/src/lib/retrieval/routing.test.ts`: 8 governance tests | **IMPLEMENTED** |
| Route compatibility tests | `packages/server/src/routes/retrieval.test.ts`: 7 compatibility tests | **IMPLEMENTED** |
| Trace metadata emission | RAG log entries include routingTrace in all paths (success, empty, error) | **IMPLEMENTED** |

### Plan 29-03: Baseline-aware Eval Outputs

| Capability | Evidence | Status |
|------------|----------|--------|
| `baselineReportSchema` | `packages/contracts/src/domain/evals/report.ts`: schema version, timestamp, tier, commitSha, slices, cohorts, governanceFailures | **IMPLEMENTED** |
| `regressionThresholdsSchema` | `packages/contracts/src/domain/evals/report.ts`: hitAt1Threshold, mrrThreshold, passRateThreshold, maxGovernanceIncrease | **IMPLEMENTED** |
| `TIER_THRESHOLDS` presets | `packages/contracts/src/domain/evals/report.ts`: smoke (-10%, +1 governance), core (-5%, +0 governance) | **IMPLEMENTED** |
| `regressionResultSchema` | `packages/contracts/src/domain/evals/report.ts`: hasRegressions, regressedSlices, improvedSlices, governanceRegressions | **IMPLEMENTED** |
| `selectedMode` in eval types | `evals/retrieval/lib/types.ts`: `selectedMode?: RetrievalStrategy` | **IMPLEMENTED** |
| `fallbackApplied` in eval types | `evals/retrieval/lib/types.ts`: `fallbackApplied: boolean` | **IMPLEMENTED** |
| `regressionStatus` per slice | `evals/retrieval/lib/report.ts`: `regressed`, `stable`, `improved`, `no-baseline` | **IMPLEMENTED** |
| Baseline CLI options | `evals/retrieval/run.ts`: `--baseline <path>`, `--write-baseline` | **IMPLEMENTED** |
| CI baseline comparison | `evals/scripts/eval-ci.ts`: `compareWithBaseline()`, `loadBaseline()`, `writeBaseline()` | **IMPLEMENTED** |
| Failure policy doc | `evals/retrieval/README.md`: governance leaks and empty-result mismatches always fail | **IMPLEMENTED** |

---

## Baseline/Failure-Policy Capability Evidence

### Baseline Report Schema

From `packages/contracts/src/domain/evals/report.ts`:

```typescript
export const baselineReportSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime(),
  tier: retrievalEvalTierSchema,
  commitSha: z.string().min(7).optional(),
  branch: z.string().min(1).optional(),
  slices: z.array(baselineSliceSchema),
  cohorts: z.array(baselineCohortSchema).optional(),
  governanceFailures: z.array(baselineGovernanceFailureSchema),
  totalCases: z.number().int().min(0),
  passedCases: z.number().int().min(0),
  passRate: z.number().min(0).max(1),
  durationMs: z.number().int().min(0),
});
```

### Regression Thresholds

From `packages/contracts/src/domain/evals/report.ts`:

```typescript
export const regressionThresholdsSchema = z.object({
  hitAt1Threshold: z.number().min(-1).max(0).default(-0.05),
  mrrThreshold: z.number().min(-1).max(0).default(-0.05),
  passRateThreshold: z.number().min(-1).max(0).default(-0.05),
  maxGovernanceIncrease: z.number().int().min(0).default(0),
});

export const TIER_THRESHOLDS: Record<'smoke' | 'core', RegressionThresholds> = {
  smoke: { hitAt1Threshold: -0.10, mrrThreshold: -0.10, passRateThreshold: -0.10, maxGovernanceIncrease: 1 },
  core: { hitAt1Threshold: -0.05, mrrThreshold: -0.05, passRateThreshold: -0.05, maxGovernanceIncrease: 0 },
};
```

### Failure Policy

From `evals/retrieval/README.md`:

| Failure Kind | Policy |
|--------------|--------|
| Governance leaks | **Always fail** |
| Empty-result mismatch | **Always fail** |
| Ranking regression | Report only (compare against baseline) |

---

## Deferred Operational Caveat

The CI workflow (`.github/workflows/eval.yml`) has defects documented in Phase 28 verification:

1. Missing `id: eval` step causes empty output variable references
2. No smoke baseline publication step

These affect CI execution health but do not invalidate the EOPS-03 capability that Phase 29 delivered. The baseline/failure-policy types, runner options, and comparison functions exist and are verifiable in code.

**Resolution:** Phase 46 will fix CI workflow defects. Phase 29 verification confirms capability delivery, not CI operational health.

---

## Test Verification

From Phase 29 execution:

```
Test Files  44 passed (44)
Tests       925 passed (925)
```

- Routing tests pass (`routing.test.ts`)
- Eval report tests pass (`report.test.ts`)
- Retrieval integration tests pass

---

## Truths Validated

| Truth | Status |
|-------|--------|
| Evaluation outputs can compare retrieval behavior against stable internal mode IDs rather than ad-hoc labels | **VERIFIED** -- `RetrievalStrategy` enum used throughout |
| Baseline artifacts capture routing reason and fallback data needed to interpret regressions | **VERIFIED** -- `RoutingTrace` includes all fields |
| Failure policy distinguishes hard governance failures from allowed ranking drift by mode slice | **VERIFIED** -- documented and implemented |
| Baseline write/compare flow exists for regression detection | **VERIFIED** -- CLI options and CI helper functions |

---

## Conclusion

**EOPS-03 is VERIFIED.** Phase 29 delivered:

- Baseline report schema with per-slice metrics and governance tracking
- Regression thresholds with tier-specific presets
- Baseline write/compare flow in retrieval runner
- CI baseline comparison helper in `eval-ci.ts`
- Explicit failure policy distinguishing governance failures from ranking drift
- Routing trace metadata for regression attribution

CI operational health is a separate concern, deferred to Phase 46.

---

*Backfilled: 2026-04-28*
*Original verification: 2026-04-23*
