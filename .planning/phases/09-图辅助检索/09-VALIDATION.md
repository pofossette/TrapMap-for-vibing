---
phase: 09
slug: 图辅助检索
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-15
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | `vitest.workspace.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/normalize.test.ts src/lib/indexing/pipeline.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~20-40 seconds focused, longer workspace-wide |
| **Typecheck policy** | Phase-gating type checks use `pnpm --filter @skill-shareer/server exec tsc --noEmit` and `pnpm --filter @skill-shareer/cli exec tsc --noEmit`; workspace `pnpm typecheck` remains informational if failures stay limited to the pre-existing baseline or explicitly documented Phase 9 gaps |
| **Baseline caveat** | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts` is currently red due to missing `indexing/adapters/vector.ts`, missing `indexing/adapters/keyword.ts`, and undefined mocks in persisted-index-state retrieval tests; Phase 9 plans must either repair or route around this baseline before claiming green verification |

---

## Sampling Rate

- **After every task commit:** Run the narrowest focused command for the touched task.
- **After every plan:** Run that plan's combined verification command exactly as written in its PLAN file.
- **After every wave:** Run `pnpm --filter @skill-shareer/server test -- src/lib/indexing/normalize.test.ts src/lib/indexing/pipeline.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit && pnpm --filter @skill-shareer/cli exec tsc --noEmit`
- **Before `/gsd-verify-work`:** Run `pnpm test`, then `pnpm typecheck`, and confirm any failures are either resolved or already documented as baseline noise.
- **Max feedback latency:** 40 seconds for focused checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | GRAPH-01, GRAPH-07, BOUND-01 | T-09-01 / T-09-02 | Internal indexing contracts widen to include graph state without changing public retrieval contracts | unit + typecheck | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ | ⬜ pending |
| 09-01-02 | 01 | 1 | GRAPH-01, GRAPH-07, BOUND-05 | T-09-02 / T-09-03 | Graph adapter sync/remove behavior is idempotent and lifecycle-aware | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts src/lib/indexing/adapters/graph.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | GRAPH-03, GRAPH-07 | T-09-04 | Entity extraction is deterministic, conservative, and covers the required entity classes | unit | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/retrieval/recall/graph-assisted.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | GRAPH-04, GRAPH-05, BOUND-03, BOUND-05 | T-09-01 / T-09-04 | Query expansion and relationship scoring operate only over eligible entries and indexed graph state | unit + integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/graph-assisted.test.ts src/lib/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 3 | GRAPH-02, GRAPH-06, BOUND-01, BOUND-02, BOUND-04 | T-09-01 / T-09-05 | `mode: graph-assisted` no longer returns 501 and preserves the existing response shape and bucket semantics | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ✅ | ⬜ pending |
| 09-04-01 | 04 | 4 | GRAPH-06, GRAPH-07 | T-09-03 / T-09-05 | Verification baseline is trustworthy because existing red tests are repaired or explicitly isolated | integration + typecheck | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/vector.test.ts src/lib/indexing/adapters/keyword.test.ts src/lib/indexing/adapters/graph.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/indexing/adapters/graph.test.ts` — graph adapter sync/remove and adjacency tests
- [ ] `packages/server/src/lib/retrieval/recall/graph-assisted.test.ts` — query expansion and relationship-assisted recall coverage
- [ ] `packages/server/src/lib/indexing/adapters/graph.ts` — implementation target required by adapter tests
- [ ] Decide whether Phase 9 will also create `packages/server/src/lib/indexing/adapters/vector.ts` and `packages/server/src/lib/indexing/adapters/keyword.ts` to repair the current indexing-adapter baseline, or will explicitly isolate verification from those missing files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Graph-assisted results surface hidden but intuitively relevant entries for shorthand or symptom-first queries | GRAPH-05, GRAPH-06 | Automated fixtures can prove deterministic behavior, but only a human can judge whether the surfaced relationship feels useful | Seed a dev dataset with entries that share service/tool/symptom/root-cause relationships, run the same query with `--mode semantic`, `--mode hybrid`, and `--mode graph-assisted`, and confirm graph-assisted reveals indirectly related but still authorized entries |
| Reason strings remain concise and do not leak raw graph internals | BOUND-01, BOUND-02 | Contract tests can preserve shape, but they do not fully judge human-readable output quality | Run CLI retrieval in normal and `--json` modes after graph-assisted wiring, confirm the JSON shape is unchanged, and confirm human-readable output mentions relevance without exposing raw node IDs, adjacency dumps, or unauthorized entity names |
| Baseline server red tests are understood before sign-off | GRAPH-07 | If the baseline is still red, a human must confirm whether the remaining failures are deliberate, inherited, or newly introduced | Run the focused server suites and record whether failures are limited to pre-existing missing adapters / mock issues or whether any new graph-related regressions appear |

---

## Plan Coverage

| Plan File | Wave | Validation Focus | Primary Commands |
|-----------|------|------------------|------------------|
| `09-01-PLAN.md` | 1 | internal indexing contract widening and graph adapter seam | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/pipeline.test.ts src/lib/indexing/adapters/graph.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| `09-02-PLAN.md` | 2 | deterministic entity extraction and lightweight graph storage | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/graph.test.ts src/lib/retrieval/recall/graph-assisted.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| `09-03-PLAN.md` | 3 | graph-assisted recall and orchestrator wiring | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/recall/graph-assisted.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts`, `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` |
| `09-04-PLAN.md` | 4 | baseline verification hardening and end-to-end graph mode confidence | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/adapters/vector.test.ts src/lib/indexing/adapters/keyword.test.ts src/lib/indexing/adapters/graph.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts`, `pnpm --filter @skill-shareer/server exec tsc --noEmit` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 requirements are explicit
- [x] Quick and full commands are defined
- [x] Manual-only verifications are documented
- [x] Phase-scoped type checks are identified
- [x] Current red baseline is documented so plans can address it intentionally
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
