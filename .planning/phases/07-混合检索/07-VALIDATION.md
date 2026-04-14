---
phase: 07
slug: 混合检索
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.workspace.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~20-35 seconds focused, longer for workspace-wide full suite |
| **Typecheck policy** | Phase-gating type checks use `pnpm --filter @skill-shareer/server exec tsc --noEmit`; workspace `pnpm typecheck` is informational until the pre-existing unrelated failures in `packages/server/src/routes/operations.ts` and `packages/cli/src/commands/audit.ts` are cleared |

---

## Sampling Rate

- **After every task commit:** Run the narrowest focused command for the touched task. Prefer the task-local command from the verification map over a broader suite.
- **After every plan:** Run that plan's combined verification command exactly as written in its PLAN file.
- **After every wave:** Run `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit`
- **Before `/gsd-verify-work`:** Run `pnpm test` and then run `pnpm typecheck`, treating only the already-documented unrelated failures in `packages/server/src/routes/operations.ts` and `packages/cli/src/commands/audit.ts` as baseline noise.
- **Max feedback latency:** 35 seconds for focused checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | HYBR-01, BOUND-03, BOUND-05 | T-07-01 / T-07-02 | Internal candidate metadata stays server-only and does not change public contracts | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | HYBR-01, BOUND-03, BOUND-05 | T-07-01 / T-07-02 / T-07-03 | Keyword recall scores only caller-provided eligible entries and keeps normalized deterministic output | unit + typecheck | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 2 | HYBR-02, BOUND-01, BOUND-02 | T-07-05 | Merge logic deduplicates by `entry.id` and preserves internal evidence without leaking channel internals publicly | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 2 | HYBR-04, BOUND-01, BOUND-02, BOUND-04, BOUND-05 | T-07-04 / T-07-06 / T-07-07 | Hybrid mode uses filter -> recall -> merge -> assembly order while API and CLI contracts remain unchanged | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 3 | HYBR-03, BOUND-03, BOUND-05 | T-07-08 / T-07-09 / T-07-10 | Rerank reorders only merged safe candidates and does not add new entries or bypass filtering | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 3 | HYBR-05, BOUND-03, BOUND-05 | T-07-09 / T-07-11 | Short-query hybrid improvement is proven with deterministic fixtures while approval-first boundaries remain intact | integration + typecheck | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is already satisfied by existing test infrastructure and planned test files.

- [x] `packages/server/src/lib/retrieval/recall/keyword.test.ts` is planned in `07-01-PLAN.md` and provides the initial narrow test harness for keyword recall behavior
- [x] `packages/server/src/lib/retrieval.test.ts` already exists and is extended across Plans 02-03 for merge, hybrid dispatch, and rerank evidence
- [x] `packages/server/src/lib/retrieval-workflow.test.ts` already exists and covers the approval-before-search workflow needed for rerank safety regression checks
- [x] `packages/server/src/routes/retrieval.test.ts` already exists and covers route-level hybrid acceptance with unchanged contract shape
- [x] `packages/cli/src/commands/retrieval.test.ts` already exists and covers `--mode hybrid` passthrough without exposing retrieval-channel internals

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Short-query result quality actually feels better in terminal output, not just in fixture assertions | HYBR-05 | Automated tests can prove deterministic improvement on fixtures, but they cannot judge whether the surfaced results read as more useful for real operator queries | Run the Phase 7 retrieval command against a seeded dev dataset with a short query such as a tool name or shorthand symptom, compare `--mode semantic` versus `--mode hybrid`, and confirm the top result set is more relevant without exposing unauthorized entries |
| CLI human-readable output remains concise after hybrid mode is enabled | BOUND-02 | Snapshot-style assertions do not fully capture terminal readability | Run the retrieval CLI with and without `--json` after Plan 02 or later, confirm output shape remains stable, and confirm no semantic/keyword/rerank internals leak into the human-readable formatter |
| Workspace `pnpm typecheck` noise is still unrelated to Phase 7 | BOUND-01 | The workspace command is known to fail outside this phase, so a human must confirm no new Phase 7 failures were introduced into the baseline | Run `pnpm typecheck`, verify the failures remain limited to `packages/server/src/routes/operations.ts` and `packages/cli/src/commands/audit.ts`, and treat any new retrieval-related diagnostics as regressions |

---

## Plan Coverage

| Plan File | Wave | Validation Focus | Primary Commands |
|-----------|------|------------------|------------------|
| `07-01-PLAN.md` | 1 | keyword recall contracts and lexical scoring | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/keyword.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| `07-02-PLAN.md` | 2 | merge, dedupe, and hybrid-mode route/CLI wiring | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts`, `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| `07-03-PLAN.md` | 3 | rerank, short-query improvement evidence, and approval-boundary regression checks | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] Quick and full commands are defined
- [x] Manual-only verifications are documented
- [x] Workspace `pnpm typecheck` baseline noise is explicitly documented
- [x] Phase-scoped type checks are identified for retrieval work
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
