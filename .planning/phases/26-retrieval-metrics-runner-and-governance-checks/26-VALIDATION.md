---
phase: 26
slug: retrieval-metrics-runner-and-governance-checks
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
updated: 2026-04-28
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run evals/retrieval/**/*.test.ts` |
| **Full suite command** | `pnpm test` |
| **Direct runner (dry-run)** | `node --import tsx evals/retrieval/run.ts --tier smoke --dry-run` |
| **Direct runner (live)** | `node --import tsx evals/retrieval/run.ts --tier smoke` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run evals/retrieval/**/*.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Files Verified | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|----------------|--------|
| 26-01-01 | 01 | 1 | REVAL-01 | T-26-01 | Runner executes cases through explicit adapters without bypassing shared contracts | integration | `pnpm exec vitest run evals/retrieval/runner.test.ts` | `evals/retrieval/runner.test.ts` | verified |
| 26-01-02 | 01 | 1 | REVAL-03 | T-26-02 | Ranking metrics compute deterministically from normalized hits | unit | `pnpm exec vitest run evals/retrieval/lib/metrics.test.ts` | `evals/retrieval/lib/metrics.test.ts` | verified |
| 26-02-01 | 02 | 2 | REVAL-04 | T-26-03 | Governance failures surface explicitly, remain separate from ranking metrics, and cover explicit fallback behavior | integration | `pnpm exec vitest run evals/retrieval/lib/assertions.test.ts` | `evals/retrieval/lib/assertions.test.ts` | verified |
| 26-02-02 | 02 | 2 | REVAL-01, REVAL-03, REVAL-04 | T-26-04 | JSON and terminal reports stay stable, sorted, and regression-friendly | integration | `pnpm exec vitest run evals/retrieval/lib/report.test.ts` | `evals/retrieval/lib/report.test.ts` | verified |

*Status: verified - all task rows map to concrete test files that exist on disk.*

---

## Supporting Test Coverage

The following test files provide additional coverage for Phase 26 artifacts. They are exercised by the quick-run command but listed here for traceability:

| File | Requirements | Coverage |
|------|-------------|----------|
| `evals/retrieval/lib/normalize.test.ts` | REVAL-01 | v1/v2/v3 response normalization into shared result shape |
| `evals/retrieval/datasets/retrieval-datasets.test.ts` | REVAL-01, REVAL-03 | Golden dataset schema validation, coverage matrix, scenario resolution, governance separation |

---

## Direct Runner Commands

These commands exercise the full retrieval evaluation runner end-to-end, providing integration coverage beyond unit tests:

| Command | Purpose | Tier |
|---------|---------|------|
| `node --import tsx evals/retrieval/run.ts --tier smoke --dry-run` | Validate case loading and schema checks without executing endpoints | smoke |
| `node --import tsx evals/retrieval/run.ts --tier smoke` | Execute smoke-tier cases against live retrieval endpoints | smoke |
| `node --import tsx evals/retrieval/run.ts --tier core --dry-run` | Validate core-tier case loading | core |
| `node --import tsx evals/retrieval/run.ts --tier core` | Execute core-tier cases against live retrieval endpoints | core |

---

## Red-Case Boundaries

Red (failing) smoke cases are valid proof of evaluator capability and governance detection. A red case demonstrates that:

1. The evaluator correctly identifies forbidden-result leakage (governance failure)
2. The evaluator detects unexpected empty or non-empty results (outcome mismatch)
3. Governance verdicts remain separate from ranking metrics (a high-recall result can still fail on governance)

Red cases do NOT indicate that the validation artifact itself is invalid. They reflect the current health of the retrieval system under test.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal report readability for maintainers | REVAL-01, REVAL-03, REVAL-04 | JSON tests cannot judge whether the output is scannable in normal terminal use | Run the root retrieval-eval script for smoke and core tiers, confirm the summary separates ranking metrics, governance failures, and adapter warnings |

---

## Validation Sign-Off

- [x] All tasks map to concrete automated test files on disk
- [x] Sampling continuity: no task row points to a missing or placeholder file
- [x] Every task row references a real `evals/retrieval/**/*.test.ts` file
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter — all rows verified against existing files
- [x] `wave_0_complete: true` — no W0 placeholders remain

**Approval:** complete
