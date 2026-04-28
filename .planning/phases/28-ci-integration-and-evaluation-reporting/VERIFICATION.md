---
phase: 28-ci-integration-and-evaluation-reporting
verified: 2026-04-28T15:10:00Z
status: partial
requirements_verified:
  - EOPS-01-partial
  - EOPS-02-partial
deferred_defects:
  - missing-eval-step-id
  - unified-runner-module-resolution
  - smoke-baseline-upload-gap
---

# Phase 28 Verification: CI Integration and Evaluation Reporting

**Phase scope:** Wire pnpm scripts, CI workflows, and unified runner so maintainers can run evaluations locally and in CI.

**Verification date:** 2026-04-28 (backfilled from current codebase evidence)
**Plans verified:** 28-01, 28-02

---

## Executive Summary

Phase 28 is **PARTIALLY VERIFIED**. The intended operational surface exists:

- Unified eval scripts (`eval:smoke`, `eval:core`, `eval:ci`)
- GitHub Actions workflow with PR smoke and scheduled core evaluation
- Combined runner (`evals/scripts/eval-all.ts`) and CI runner (`evals/scripts/eval-ci.ts`)
- Machine-readable JSON reports and GitHub Actions output variables

However, **live defects** prevent full operational closure:

1. The GitHub Actions workflow references `steps.eval.outputs.*` but the eval step lacks `id: eval`
2. The unified runner (`eval-all.ts`) fails at runtime due to module resolution on `@trapmap/contracts` imports
3. The smoke evaluation downloads `baseline-smoke` artifact but no scheduled job publishes it

These defects are **deferred** to Phase 46 (CI fix) and Phase 47 (final EOPS closure). Phase 28 verification confirms the intended capability surface exists while explicitly recording the operational gaps.

---

## Requirement Traceability

| Requirement | Phase 28 Contribution | Status | Evidence |
|-------------|-----------------------|--------|----------|
| EOPS-01 | Machine-readable and human-readable reports comparing across endpoint/mode combinations | **PARTIAL** | Report schema and slice comparison exist, but unified runner fails at runtime |
| EOPS-02 | Fast smoke path for PRs, broader core path for regression tracking | **PARTIAL** | CI workflow exists, but output variable wiring and baseline publication are broken |

---

## Capability Verification

### Plan 28-01: Unified Scripts and Docs

| Capability | Evidence | Status |
|------------|----------|--------|
| Unified eval:smoke script | `package.json`: `"eval:smoke": "pnpm exec tsx evals/scripts/eval-all.ts --tier smoke"` | **IMPLEMENTED** |
| Unified eval:core script | `package.json`: `"eval:core": "pnpm exec tsx evals/scripts/eval-all.ts --tier core"` | **IMPLEMENTED** |
| Unified eval:all script | `package.json`: `"eval:all": "pnpm exec tsx evals/scripts/eval-all.ts --tier core"` | **IMPLEMENTED** |
| Slice comparison output | `evals/retrieval/lib/format.ts`: `formatSliceComparison()`, `evals/summary/lib/format.ts`: `formatSliceComparison()` | **IMPLEMENTED** |
| Runner API abstraction | `evals/retrieval/lib/runner-api.ts`, `evals/summary/lib/runner-api.ts` | **IMPLEMENTED** |
| Maintainer workflow documentation | `evals/README.md`: "How to Add Cases", "Interpreting Failures" sections | **IMPLEMENTED** |
| Summary evaluation README | `evals/summary/README.md` | **IMPLEMENTED** |

### Plan 28-02: CI Integration

| Capability | Evidence | Status |
|------------|----------|--------|
| GitHub Actions workflow | `.github/workflows/eval.yml` | **IMPLEMENTED** |
| PR smoke evaluation trigger | `on: pull_request: branches: [main]` with path filters | **IMPLEMENTED** |
| Scheduled core evaluation | `schedule: - cron: '0 6 * * 1'` (weekly Monday 6 AM UTC) | **IMPLEMENTED** |
| CI runner script | `evals/scripts/eval-ci.ts` | **IMPLEMENTED** |
| eval:ci script | `package.json`: `"eval:ci": "pnpm exec tsx evals/scripts/eval-ci.ts"` | **IMPLEMENTED** |
| eval:ci:core script | `package.json`: `"eval:ci:core": "TIER=core pnpm exec tsx evals/scripts/eval-ci.ts"` | **IMPLEMENTED** |
| GitHub Actions output variables | `eval-ci.ts`: `setGitHubOutput('passed', ...)`, `setGitHubOutput('has_regressions', ...)` | **IMPLEMENTED** |
| Reports directory | `reports/.gitkeep` | **IMPLEMENTED** |
| Baseline download | `.github/workflows/eval.yml`: `actions/download-artifact@v4` for `baseline-smoke` | **IMPLEMENTED** |
| Baseline upload (core) | `.github/workflows/eval.yml`: `actions/upload-artifact@v4` for `baseline-core` | **IMPLEMENTED** |

---

## Deferred Defects

### Defect 1: Missing `id: eval` Step

**Location:** `.github/workflows/eval.yml`

**Issue:** Lines 68-70 reference `steps.eval.outputs.*`:
```yaml
const hasRegressions = '${{ steps.eval.outputs.has_regressions }}' === 'true';
const regressedCount = '${{ steps.eval.outputs.regressed_count }}' || '0';
const improvedCount = '${{ steps.eval.outputs.improved_count }}' || '0';
```

But the "Run smoke evaluation" step (lines 49-53) has no `id: eval` attribute:
```yaml
- name: Run smoke evaluation
  run: pnpm eval:ci
  env:
    NODE_ENV: test
    BASELINE_PATH: reports/baselines/baseline-smoke.json
```

**Impact:** PR comment will show empty values for regression metrics.

**Deferred to:** Phase 46 (CI fix)

---

### Defect 2: Unified Runner Module Resolution

**Location:** `evals/scripts/eval-all.ts`

**Issue:** The unified runner dynamically imports `../retrieval/lib/runner-api.js`, which transitively imports `@trapmap/contracts`. In certain execution environments, this import path fails to resolve correctly.

**Impact:** `pnpm eval:smoke` via `eval-all.ts` may fail at runtime; direct runner (`evals/retrieval/run.ts`) works.

**Deferred to:** Phase 46 or Phase 47 (depending on severity assessment)

---

### Defect 3: Smoke Baseline Upload Gap

**Location:** `.github/workflows/eval.yml`

**Issue:**
- The `eval-smoke` job downloads `baseline-smoke` artifact (lines 29-34)
- But no scheduled job publishes `baseline-smoke`
- The `eval-core-scheduled` job uploads `baseline-core` (lines 120-126), not smoke

**Impact:** PR smoke evaluations compare against a baseline that never gets published, so `baseline_status: no-baseline` is the expected outcome.

**Deferred to:** Phase 46 (CI fix) -- either add smoke baseline publication or remove the download step

---

## Scope Boundaries

Phase 28 provides infrastructure. It does not include:

| Capability | Delivered By |
|------------|-------------|
| Retrieval runner execution | Phase 26 |
| Summary runner execution | Phase 27 |
| Baseline/failure-policy types | Phase 29-03 |
| Fixing CI workflow defects | Phase 46 |
| Final EOPS closure | Phase 47 |

---

## Test Verification

No dedicated test files exist for `eval-all.ts` or `eval-ci.ts`. These are integration scripts that exercise the runners beneath them.

Phase 28-01 and 28-02 summaries record the original commit hashes and execution state from 2026-04-21.

---

## Verification Summary

| Aspect | Status |
|--------|--------|
| Unified scripts exist | **VERIFIED** |
| CI workflow exists | **VERIFIED** |
| Report and output variable code exists | **VERIFIED** |
| Live workflow execution | **DEFERRED** (see defects) |
| EOPS-01 closure | **PARTIAL** -- capability proven, operational health deferred |
| EOPS-02 closure | **PARTIAL** -- capability proven, CI wiring deferred |

---

## Conclusion

Phase 28 created the intended EOPS-01/EOPS-02 surface: unified scripts, CI workflow, combined runner, and output variable integration. The implementation has live defects that prevent full operational closure. These are explicitly recorded and deferred to later phases rather than silently fixed inside verification backfill.

---

*Backfilled: 2026-04-28*
*Original phase completion: 2026-04-21*
