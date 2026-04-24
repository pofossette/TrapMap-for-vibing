# Phase 31 Verification Report

**Date:** 2026-04-24
**Phase Goal:** Extend the current evaluation automation so regressions are visible by retrieval mode, query slice, and benchmark cohort rather than only by endpoint/tier.

---

## Executive Summary

**Status:** ✅ **ACHIEVED**

Phase 31 successfully extended evaluation automation to provide regression visibility across multiple dimensions:
- Query-type cohorts (error-debugging, how-to, global-constraints, governance-sensitive, general)
- Retrieval mode comparisons (client vs router-selected)
- Baseline persistence and regression detection

---

## Requirement Traceability

| Requirement ID | Description | Phase Plan | Status | Evidence |
|----------------|-------------|------------|--------|----------|
| **EOPS-01** | Evaluation outputs machine-readable and human-readable reports that compare results across endpoint and retrieval mode combinations | 31-01, 31-02 | ✅ Complete | Cohort summaries, mode comparisons, routing distribution in reports |
| **EOPS-02** | Repo scripts support a fast smoke evaluation path for pull requests and a broader core evaluation path for regression tracking | 31-03 | ✅ Complete | GitHub Actions workflow with separate smoke/core jobs |
| **EOPS-03** | The milestone defines a baseline and failure policy so future retrieval changes can be checked against regressions instead of ad-hoc judgment | 31-03 | ✅ Complete | BaselineReport schema, TIER_THRESHOLDS, compareWithBaseline |

---

## Must-Haves Verification

### Phase 31-01: Query-Type Cohort Slices

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| Query-type cohort schemas defined in contracts (`QueryTypeCohort`, `CohortKey`, `CohortSummary`) | ✅ | `packages/contracts/src/domain/evals/report.ts:127-164` |
| Cohort aggregation function in report builder (`buildCohortSummaries`) | ✅ | `evals/retrieval/lib/report.ts:247-264` |
| Cohort comparison formatter (`formatCohortComparison`) | ✅ | `evals/retrieval/lib/format.ts:322-382` |
| All existing dataset cases tagged with query-type classification | ✅ | Dataset files contain query-type tags (e.g., `'general'`, `'governance-sensitive'`) |
| Reports include optional `cohorts` array with per-cohort metrics | ✅ | `packages/contracts/src/domain/evals/report.ts:480` |

### Phase 31-02: Mode-Aware Reporting

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| `ModeComparison` schema and type in contracts | ✅ | `packages/contracts/src/domain/evals/report.ts:174-191` |
| `RoutingDistribution` schema and type in contracts | ✅ | `packages/contracts/src/domain/evals/report.ts:197-206` |
| `buildModeComparisons` function in report builder | ✅ | `evals/retrieval/lib/report.ts:308-349` |
| `buildRoutingDistribution` function in report builder | ✅ | `evals/retrieval/lib/report.ts:355-373` |
| `formatModeComparison` function in formatter | ✅ | `evals/retrieval/lib/format.ts:399-430` |
| `formatRoutingDistribution` function in formatter | ✅ | `evals/retrieval/lib/format.ts:440-477` |
| `routeFamily` field in slice summaries | ✅ | `evals/retrieval/lib/report.ts:219` |
| Reports include `modeComparisons` and `routingDistribution` arrays | ✅ | `packages/contracts/src/domain/evals/report.ts:481-482` |

### Phase 31-03: Baseline Persistence and CI Regression

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| `BaselineReport` schema with `schemaVersion`, `timestamp`, `tier`, `slices`, `cohorts`, `governanceFailures` | ✅ | `packages/contracts/src/domain/evals/report.ts:267-294` |
| `RegressionThresholds` with tier-specific defaults (`TIER_THRESHOLDS`) | ✅ | `packages/contracts/src/domain/evals/report.ts:318-331` |
| `RegressionResult` schema for comparison output | ✅ | `packages/contracts/src/domain/evals/report.ts:337-375` |
| `compareWithBaseline` function in `eval-ci.ts` | ✅ | `evals/scripts/eval-ci.ts:125-212` |
| `writeBaseline` function in `eval-ci.ts` | ✅ | `evals/scripts/eval-ci.ts:217-267` |
| GitHub Actions workflow downloads baseline for PR smoke runs | ✅ | `.github/workflows/eval.yml:29-34` |
| GitHub Actions workflow writes baseline for scheduled core runs | ✅ | `.github/workflows/eval.yml:110,120-126` |
| GitHub Actions outputs: `has_regressions`, `regressed_count`, `improved_count`, `baseline_timestamp` | ✅ | `evals/scripts/eval-ci.ts:567-571` |
| PR comment with regression summary | ✅ | `.github/workflows/eval.yml:63-85` |

---

## Cross-Dimension Regression Visibility

The phase goal required regressions to be visible by:

### 1. Retrieval Mode
- ✅ `modeComparisons` array groups by client mode + selected mode + routing reason
- ✅ Shows avgHitAt1 and avgMrr per mode combination
- ✅ `routingDistribution` shows breakdown of routing decisions

### 2. Query Slice
- ✅ Slice summaries continue to aggregate by tier + endpoint + mode
- ✅ Now includes `routeFamily` (entry/capsule) for v1/v2 distinction
- ✅ `selectedMode` and `fallbackApplied` fields for routing trace

### 3. Benchmark Cohort
- ✅ `cohorts` array groups by query type + route family
- ✅ Query types: error-debugging, how-to, global-constraints, governance-sensitive, general
- ✅ Per-cohort metrics: passRate, avgHitAt1, avgMrr, governanceFailureCount

---

## Files Modified/Created

| File | Changes |
|------|---------|
| `packages/contracts/src/domain/evals/report.ts` | Added QueryTypeCohort, CohortKey, CohortSummary, ModeComparison, RoutingDistribution, BaselineReport, BaselineSlice, BaselineCohort, RegressionThresholds, RegressionResult schemas |
| `evals/retrieval/lib/types.ts` | Added QUERY_TYPE_TAGS, deriveQueryType, deriveRouteFamily, getCohortKeyString, getModeComparisonKey |
| `evals/retrieval/lib/report.ts` | Added buildCohortSummaries, buildCohortSummary, buildModeComparisons, buildModeComparison, buildRoutingDistribution |
| `evals/retrieval/lib/format.ts` | Added formatCohortComparison, formatModeComparison, formatRoutingDistribution |
| `evals/scripts/eval-ci.ts` | Added getBaselinePath, loadBaseline, writeBaseline, compareWithBaseline, formatRegressionResult |
| `.github/workflows/eval.yml` | Added baseline download step, WRITE_BASELINE env, baseline artifact upload, PR comment step |
| `reports/baselines/.gitkeep` | Directory placeholder |
| `reports/baselines/README.md` | Documentation for baseline management |
| Dataset files (4) | Added query-type tags to all 15 existing cases |

---

## Regression Detection Implementation

### Tier-Specific Thresholds
- **Smoke (PR):** -10% threshold, allows 1 additional governance failure
- **Core (Scheduled):** -5% threshold, no additional governance failures allowed

### CI Workflow
1. **PR Smoke Run:**
   - Downloads latest baseline artifact
   - Runs smoke evaluation
   - Compares against baseline
   - Posts PR comment with regression summary

2. **Scheduled Core Run:**
   - Runs core evaluation
   - Writes new baseline artifact (90-day retention)

### GitHub Actions Outputs
- `has_regressions`: Boolean flag for CI decisions
- `regressed_count`: Number of regressed slices
- `improved_count`: Number of improved slices
- `baseline_timestamp`: When baseline was captured
- `baseline_status`: 'available' or 'no-baseline'

---

## Discrepancies and Notes

### REQUIREMENTS.md Update Needed
The REQUIREMENTS.md traceability table shows EOPS-01, EOPS-02, EOPS-03 as pending with Phase 28/29, but Phase 31 actually implements these requirements:

| Current Entry | Should Be |
|---------------|-----------|
| EOPS-01: Phase 28, Pending | EOPS-01: Phase 31, Complete |
| EOPS-02: Phase 28, Pending | EOPS-02: Phase 31, Complete |
| EOPS-03: Phase 29, Pending | EOPS-03: Phase 31, Complete |

---

## Conclusion

Phase 31 fully achieved its goal. The evaluation automation now provides multi-dimensional regression visibility:

1. **Cohort-level analysis** enables understanding regressions by query semantic category
2. **Mode comparison** shows how router decisions affect retrieval quality
3. **Baseline persistence** provides automated regression detection in CI
4. **Tier-specific thresholds** balance PR velocity with quality gates

All must-haves are implemented, all requirement IDs are satisfied, and the phase summaries accurately reflect the work completed.
