---
phase: 11
slug: 索引生命周期集成
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-15
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` |
| **Config file** | package scripts call `vitest run` directly |
| **Quick run command** | `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/routes/knowledge.test.ts src/routes/operations.test.ts` |
| **Full suite command** | `pnpm --filter @skill-shareer/server test && pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| **Estimated runtime** | ~20-45 seconds focused, longer for full server suite |
| **Typecheck policy** | Phase-gating typecheck uses `pnpm --filter @skill-shareer/server exec tsc --noEmit` after each plan’s focused route tests pass |
| **Baseline caveat** | `packages/server/src/routes/review.test.ts` and `packages/server/src/routes/knowledge.test.ts` do not exist yet; Phase 11 creates them in the first task that needs them, so focused verification is only valid after those producer tasks run |

---

## Sampling Rate

- **After every task commit:** Run the narrowest focused command for the touched route or service seam.
- **After every plan:** Run that plan’s combined verification command exactly as written in its `PLAN.md`.
- **After every wave:** Run `pnpm --filter @skill-shareer/server test -- src/lib/indexing/events.test.ts src/routes/review.test.ts src/routes/knowledge.test.ts src/routes/operations.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit`.
- **Before `/gsd-verify-work`:** Run `pnpm --filter @skill-shareer/server test && pnpm --filter @skill-shareer/server exec tsc --noEmit`.
- **Max feedback latency:** 30 seconds for focused checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | IDX-03 | T-11-02 | Bootstrap exposes one shared `indexAdapters` registration seam and approval-path coverage is created before route wiring | integration | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts src/lib/indexing/events.test.ts` | ❌ created by 11-01 Task 1 | ⬜ pending |
| 11-01-02 | 01 | 1 | IDX-03, IDX-04 | T-11-01 / T-11-03 | Review approval triggers indexing only after commit, while rejection remains a no-op | integration + typecheck | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts src/lib/indexing/events.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ after 11-01 Task 1 | ⬜ pending |
| 11-02-01 | 02 | 2 | IDX-05, IDX-06 | T-11-04 / T-11-06 | Approved refresh and deactivate removal are pinned by route-level tests before route code changes | integration | `pnpm --filter @skill-shareer/server test -- src/routes/knowledge.test.ts src/routes/operations.test.ts` | `knowledge.test.ts` ❌ created by 11-02 Task 1, `operations.test.ts` ✅ | ⬜ pending |
| 11-02-02 | 02 | 2 | IDX-05, IDX-06 | T-11-04 / T-11-05 / T-11-06 | Approved updates refresh after commit, non-approved updates stay no-op, and deactivation removes persisted index state after commit | integration + typecheck | `pnpm --filter @skill-shareer/server test -- src/routes/knowledge.test.ts src/routes/operations.test.ts src/lib/indexing/events.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` | ✅ after 11-02 Task 1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 producer plan exists for Phase 11. Test producers are created inline by the first task of each plan:

- [ ] `11-01` Task 1 creates `packages/server/src/routes/review.test.ts` and exposes the adapter-registration seam before approval-route wiring verification
- [ ] `11-02` Task 1 creates `packages/server/src/routes/knowledge.test.ts` and extends `packages/server/src/routes/operations.test.ts` before refresh/remove wiring verification
- [ ] `packages/server/src/lib/indexing/events.test.ts` remains the centralized transition-map regression gate reused by both plans

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Post-commit indexing feels operationally correct during full review -> search lifecycle | IDX-04, IDX-05, IDX-06 | Automated tests can prove store state changes, but a human should confirm the route flow remains coherent end to end | Seed an entry, approve it, update it, then deactivate it through the real API flow and confirm index state appears, refreshes, then disappears in that order |
| Legacy retrieval fallback still works for entries that have not been reindexed yet | IDX-03..IDX-06 | Phase 11 intentionally avoids retrieval cleanup, so a human should verify fallback behavior was not accidentally removed | Query a legacy entry with `indexState: null` before and after Phase 11 changes and confirm retrieval still returns it through existing fallback logic |

---

## Plan Coverage

| Plan File | Wave | Validation Focus | Primary Commands |
|-----------|------|------------------|------------------|
| `11-01-PLAN.md` | 1 | adapter registration seam and post-commit review approval wiring | `pnpm --filter @skill-shareer/server test -- src/routes/review.test.ts src/lib/indexing/events.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` |
| `11-02-PLAN.md` | 2 | post-commit refresh/remove wiring for update and deactivate routes | `pnpm --filter @skill-shareer/server test -- src/routes/knowledge.test.ts src/routes/operations.test.ts src/lib/indexing/events.test.ts && pnpm --filter @skill-shareer/server exec tsc --noEmit` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit producer-task coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Producer-task sequencing for missing tests is explicit
- [x] Quick and full commands are defined
- [x] Manual-only verifications are documented
- [x] Phase-scoped typecheck is identified
- [x] Current missing test files are documented as plan-task prerequisites
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
