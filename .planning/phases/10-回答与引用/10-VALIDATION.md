---
phase: 10
slug: 回答与引用
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | package scripts call `vitest run` directly |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` |
| **Full suite command** | `pnpm test && pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| **Estimated runtime** | ~20-45 seconds focused, longer workspace-wide |
| **Typecheck policy** | Phase-gating typecheck uses `pnpm --filter @skill-shareer/server exec tsc --noEmit`; Phase 10 explicitly absorbs the current red baseline in Plan `10-01` before using that command as a trustworthy gate |
| **Baseline caveat** | `pnpm --filter @skill-shareer/server exec tsc --noEmit` is red before Phase 10 due to existing adapter export, `indexState.graph`, and retrieval test typing issues; execution must not claim green verification until Plan `10-01` clears those failures |

---

## Sampling Rate

- **After every task commit:** Run the narrowest focused verification command for the touched task.
- **After every plan:** Run that plan's combined verification command exactly as written in its `PLAN.md`.
- **After every wave:** Run `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit`.
- **Before `/gsd-verify-work`:** Run `pnpm test` and confirm any remaining failures are either resolved or explicitly documented as known non-Phase-10 baseline noise.
- **Max feedback latency:** 45 seconds for focused checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | BOUND-01, BOUND-05 | T-10-01 / T-10-02 | Server typecheck baseline is green and trustworthy before Phase 10 output-stage changes land | typecheck + focused regression | `pnpm --filter @skill-shareer/server exec tsc --noEmit && pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval/recall/graph-assisted.test.ts` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | SUMM-06, BOUND-01 | T-10-01 / T-10-03 | Shared contracts define canonical `summary` and citation fields, with any refinement compatibility handled explicitly | contract + typecheck | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/contracts exec tsc --noEmit` | ✅ | ⬜ pending |
| 10-02-01 | 02 | 2 | CITE-01, CITE-06 | T-10-04 / T-10-05 | Internal rerank output preserves auditable evidence needed to build citations | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts` | ✅ | ⬜ pending |
| 10-02-02 | 02 | 2 | CITE-01, CITE-02, CITE-03, CITE-04, CITE-05, BOUND-03, BOUND-04, BOUND-05 | T-10-04 / T-10-06 | Citation Builder emits contract-shaped citations from already-filtered safe hits without changing bucket semantics | unit + integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts` | ❌ Wave 0 | ⬜ pending |
| 10-03-01 | 03 | 3 | SUMM-01, SUMM-02, SUMM-03, SUMM-04, SUMM-05 | T-10-07 / T-10-08 | Summary Builder is optional, deterministic, and only consumes safe hits/citations | unit | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts` | ❌ Wave 0 | ⬜ pending |
| 10-03-02 | 03 | 3 | BOUND-03, BOUND-05 | T-10-07 / T-10-09 | Summary wiring preserves approval/team/level filtering before output generation | integration | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` | ✅ | ⬜ pending |
| 10-04-01 | 04 | 4 | SUMM-06, BOUND-02 | T-10-10 / T-10-11 | CLI consumes only shared contract fields and renders JSON/text safely | cli | `pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts` | ✅ | ⬜ pending |
| 10-04-02 | 04 | 4 | BOUND-01, BOUND-04, BOUND-05 | T-10-11 / T-10-12 | Route remains a thin parse/delegate boundary and full Phase 10 gate passes | integration + typecheck | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval/summary.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/server/src/lib/retrieval/citations.test.ts` — covers `CITE-01`..`CITE-06`
- [ ] `packages/server/src/lib/retrieval/summary.test.ts` — covers `SUMM-01`..`SUMM-05`
- [ ] Extend `packages/server/src/lib/retrieval.test.ts` with citation/summary assertions across `semantic`, `hybrid`, and `graph-assisted`
- [ ] Extend `packages/server/src/routes/retrieval.test.ts` for new request flag and response contract semantics
- [ ] Extend `packages/cli/src/commands/retrieval.test.ts` for JSON fidelity and human-readable citation/summary formatting
- [ ] Clear the current server typecheck red baseline before using `tsc --noEmit` as a trustworthy regression gate

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Human-readable CLI output remains concise while still making citation provenance understandable | BOUND-02 | Automated tests can assert presence of key fields, but not whether the terminal output stays easy to scan | Run retrieval in default text mode and `--json`; confirm text mode shows concise source/snippet/channel cues without dumping raw internal score blobs |
| Summary quality is extractive and faithful to the returned hits | SUMM-02, SUMM-04 | Automated tests can prove source restriction, but a human must judge whether the summary actually reflects the cited hits | Use a seeded dataset, run the same query with summary off and on, and confirm the summary only restates ideas visible in returned hits and citations |
| Compatibility alias behavior for `includeRefinement` / `refinementSummary` is understandable and non-surprising | SUMM-06 | Contract tests can prove parse behavior, but a human must judge whether the migration behavior is coherent for users | Call the route and CLI with canonical summary fields and legacy refinement flags, and confirm behavior matches the documented compatibility policy |

---

## Plan Coverage

| Plan File | Wave | Validation Focus | Primary Commands |
|-----------|------|------------------|------------------|
| `10-01-PLAN.md` | 1 | baseline absorption and shared contract definition | `pnpm --filter @skill-shareer/server exec tsc --noEmit`, `pnpm --filter @skill-shareer/contracts test`, `pnpm --filter @skill-shareer/contracts exec tsc --noEmit` |
| `10-02-PLAN.md` | 2 | citation evidence preservation and Citation Builder wiring | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval.test.ts src/routes/retrieval.test.ts` |
| `10-03-PLAN.md` | 3 | optional summary builder and filter-first safety | `pnpm --filter @skill-shareer/server test -- src/lib/retrieval/summary.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts` |
| `10-04-PLAN.md` | 4 | CLI/route contract fidelity and final phase gate | `pnpm --filter @skill-shareer/contracts test && pnpm --filter @skill-shareer/server test -- src/lib/retrieval/citations.test.ts src/lib/retrieval/summary.test.ts src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/retrieval.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 requirements are explicit
- [x] Quick and full commands are defined
- [x] Manual-only verifications are documented
- [x] Phase-scoped typecheck is identified
- [x] Current red baseline is documented so plans can address it intentionally
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
