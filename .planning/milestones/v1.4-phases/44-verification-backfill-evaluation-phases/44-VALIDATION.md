---
phase: 44
slug: verification-backfill-evaluation-phases
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
---

# Phase 44 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest 3.2.4` plus source-truth file/contract checks against workflow and eval entrypoints |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `rtk pnpm exec vitest run evals/retrieval/runner.test.ts evals/summary/__tests__/judge.test.ts` |
| **Full suite command** | `rtk pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/normalize.test.ts evals/retrieval/lib/report.test.ts evals/retrieval/lib/assertions.test.ts evals/retrieval/runner.test.ts evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local automated command from the map below.
- **After every plan wave:** Run the wave-relevant eval tests plus the referenced contract/workflow `rg` checks.
- **Before `/gsd-verify-work`:** Re-run the full suite command and confirm the Phase 44 roadmap entry still matches the plan set before touching `.planning/ROADMAP.md`.
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | REVAL-01, REVAL-03, REVAL-04 | T-44-01-01 / T-44-01-02 | Phase 26 validation points to real retrieval tests and direct runner commands without pretending red smoke means no capability. | integration + CLI-style dry-run | `rtk pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/normalize.test.ts evals/retrieval/lib/report.test.ts evals/retrieval/lib/assertions.test.ts evals/retrieval/runner.test.ts && rtk node --import tsx evals/retrieval/run.ts --tier smoke --dry-run` | ✅ | ⬜ pending |
| 44-01-02 | 01 | 1 | SEVAL-01, SEVAL-02 | T-44-01-01 / T-44-01-02 | Phase 27 validation cites real summary tests and runner entrypoints while keeping citation-adherence and empty-core caveats explicit. | integration + CLI-style dry-run | `rtk pnpm exec vitest run evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts && rtk node --import tsx evals/summary/run.ts --tier smoke --dry-run && rtk node --import tsx evals/summary/run.ts --tier core --allow-empty` | ✅ | ⬜ pending |
| 44-02-01 | 02 | 2 | REVAL-02 | T-44-02-01 | Phase 25 verification stays scoped to contracts and golden datasets for `/v1/retrieval/search` and `/v2/retrieval/search`. | unit + contract check | `rtk pnpm exec vitest run packages/contracts/src/index.test.ts evals/retrieval/datasets/retrieval-datasets.test.ts && rtk rg -n "/v1/retrieval/search|/v2/retrieval/search" packages/contracts/src/domain/evals/retrieval.ts evals/retrieval/datasets/retrieval-datasets.test.ts` | ✅ | ⬜ pending |
| 44-02-02 | 02 | 2 | REVAL-01, REVAL-03, REVAL-04 | T-44-02-01 | Phase 26 verification distinguishes evaluator capability from live case pass/fail while preserving governance-failure evidence. | integration + contract check | `rtk pnpm exec vitest run evals/retrieval/lib/metrics.test.ts evals/retrieval/lib/assertions.test.ts evals/retrieval/lib/report.test.ts evals/retrieval/runner.test.ts && rtk node --import tsx evals/retrieval/run.ts --tier smoke --dry-run && rtk rg -n "forbidden-hit|unexpected-empty|unexpected-non-empty|shape-mismatch" evals/retrieval/lib/types.ts` | ✅ | ⬜ pending |
| 44-02-03 | 02 | 2 | SEVAL-01, SEVAL-02 | T-44-02-02 | Phase 27 verification preserves the capability-vs-signoff boundary and does not over-sign citation adherence. | integration + contract check | `rtk pnpm exec vitest run evals/summary/__tests__/claims.test.ts evals/summary/__tests__/judge.test.ts evals/summary/__tests__/scoring.test.ts && rtk node --import tsx evals/summary/run.ts --tier smoke --dry-run && rtk rg -n "summaryEvalCaseResultSchema|summaryEvalFailureKindSchema" packages/contracts/src/domain/evals/report.ts` | ✅ | ⬜ pending |
| 44-03-01 | 03 | 3 | REVAL-01, REVAL-02, REVAL-03, REVAL-04, SEVAL-01, SEVAL-02 | T-44-03-01 / T-44-03-02 | Phase 28 verification cites the unified runner and workflow as implemented surfaces while explicitly preserving deferred CI defects. | workflow + source audit | `rtk rg -n "eval-all|eval-ci|baseline-smoke|baseline-core" package.json evals/scripts/eval-all.ts evals/scripts/eval-ci.ts && rtk rg -n "steps\\.eval\\.outputs|id: eval" .github/workflows/eval.yml` | ✅ | ⬜ pending |
| 44-03-02 | 03 | 3 | EOPS-03 | T-44-03-01 | Phase 29 verification proves baseline and regression-policy capability separately from workflow health. | contract + runner-source audit | `rtk rg -n "baselineReportSchema|regressionThresholdsSchema" packages/contracts/src/domain/evals/report.ts && rtk rg -n "baseline|regression|threshold" evals/retrieval/run.ts evals/scripts/eval-ci.ts` | ✅ | ⬜ pending |
| 44-03-03 | 03 | 3 | REVAL-01, REVAL-02, REVAL-03, REVAL-04, SEVAL-01, SEVAL-02, EOPS-03 | T-44-03-01 | Phase 44 aggregate closure and roadmap sync are derived from refreshed per-phase evidence and only change roadmap text if the current entry is stale. | evidence aggregation | `rtk rg -n "REVAL-01|REVAL-02|REVAL-03|REVAL-04|SEVAL-01|SEVAL-02|EOPS-03" .planning/phases/25-evaluation-contracts-and-golden-dataset-foundation/VERIFICATION.md .planning/phases/26-retrieval-metrics-runner-and-governance-checks/VERIFICATION.md .planning/phases/27-summary-evaluation-and-judge-integration/VERIFICATION.md .planning/phases/28-ci-integration-and-evaluation-reporting/VERIFICATION.md .planning/phases/29-rag-mode-routing/VERIFICATION.md && rtk rg -n "### Phase 44:|\\*\\*Plans:\\*\\* 3 plans|44-01-PLAN\\.md|44-02-PLAN\\.md|44-03-PLAN\\.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing tests, runner entrypoints, contracts, and workflow files cover every planned verification task.

---

## Manual-Only Verifications

All planned behaviors in this phase have automated source-truth checks. No manual-only checks are required for Nyquist compliance.

---

## Validation Sign-Off

- [x] All planned tasks have `<automated>` verification commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all required references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
