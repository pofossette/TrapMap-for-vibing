---
phase: 25
slug: evaluation-contracts-and-golden-dataset-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` at repo root, plus package-level configs in `packages/contracts/vitest.config.ts` and `packages/server/vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run packages/contracts/src/index.test.ts evals/retrieval/datasets/retrieval-datasets.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched package's targeted test command plus package-local `typecheck` where applicable
- **After every plan wave:** Run the phase-targeted validation command for the modified contracts/evals surface
- **Before `/gsd-verify-work`:** Full suite must be green or explicitly document unrelated pre-existing failures
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | REVAL-01, REVAL-02 | T-25-01, T-25-02 | Shared eval schemas reject malformed scenarios/cases and keep endpoint-specific relevance/governance expectations explicit | unit | `pnpm exec vitest run packages/contracts/src/index.test.ts && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 25-01-02 | 01 | 1 | REVAL-01 | T-25-03, T-25-04 | Root `evals/` entrypoints document tier boundaries and support empty-layout dry-run without depending on Phase 25-02 datasets | unit + CLI-style dry-run | `pnpm exec vitest run packages/contracts/src/index.test.ts && pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run --allow-empty` | OK | OK |
| 25-02-01 | 02 | 2 | REVAL-02 | T-25-05 | Scenario fixtures are deterministic, schema-valid, and every case references a declared scenario | unit | `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts && pnpm --filter @trapmap/contracts typecheck` | OK | OK |
| 25-02-02 | 02 | 2 | REVAL-02 | T-25-06, T-25-07, T-25-08 | Smoke/core datasets cover v1 and v2 positive, empty, and forbidden cases, and tier entrypoints aggregate authored modules for dry-run discovery | unit + CLI-style dry-run | `pnpm exec vitest run evals/retrieval/datasets/retrieval-datasets.test.ts packages/contracts/src/index.test.ts && pnpm exec tsx evals/retrieval/run.ts --tier smoke --dry-run` | OK | OK |

*Status: OK = verified present and appropriate for execution-phase feedback sampling*

---

## Wave 0 Requirements

- [x] `packages/contracts/src/index.test.ts` -- contract validation coverage for eval schemas and invalid shape rejection
- [x] `evals/retrieval/datasets/retrieval-datasets.test.ts` -- dataset parsing, scenario resolution, and coverage regression checks
- [x] `evals/retrieval/run.ts` dry-run path -- tier selection and aggregation validation without full Phase 26 execution logic

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confirm `evals/README.md` and `evals/retrieval/README.md` clearly defer metrics/reporting/CI work to later phases | REVAL-01 | Requires human review of planning boundaries and docs wording | Read both docs after implementation and verify they distinguish Phase 25 foundation work from Phase 26-28 execution/reporting work |
| Confirm the documented v1 route-path compatibility warning remains informational only | REVAL-01 | Requires plan-boundary judgment rather than code execution | Review README and entrypoint notes to ensure they surface the risk without turning Phase 25 into a route-debugging phase |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all required Phase 25 references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
