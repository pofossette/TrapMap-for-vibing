# Phase 2 Brief: Store Snapshot 现状盘点与迁移口径冻结

Source plan: `plan.md` and `docs/todos/trapmap-architecture-remediation-plan.md`

## Goal

Complete Phase 2 of the TrapMap architecture remediation plan. This phase closes the current-state freeze for `store_snapshot`, InMemory, and PG-first semantics, including the owner/migration/test stance for the remaining compatibility paths.

## Binding Global Constraints

- Every checkbox can only be closed when structure conclusion or code remediation, affected tests, documentation write-back, `rtk pnpm check:docs-drift`, and `rtk pnpm check:structure` are all complete.
- Root `plan.md` stays an index only.
- Prefer `docs/reference/SYSTEM_TRUTH_SOURCES.md` and source entries on fact conflicts.
- Do not add a parallel phase document.
- Documentation must not describe future state as current state.
- Use `rtk` prefix for shell commands.
- Follow existing repository patterns; do not invent later-phase adapter abstractions in this phase.

## Required Inputs to Read First

- `docs/todos/trapmap-architecture-remediation-plan.md` — Phase 2 section
- `docs/reference/DATA_MODEL.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/PACKAGES.md`
- `packages/server/src/__tests__/snapshot-usage-guard.test.ts`

Then read only the additional files needed to satisfy the phase, especially the live `store.snapshot()` / `store.transact()` callers and current persistence/runtime docs.

## Phase 2 Requirements

Close these Phase 2 waves:

- Wave 2A: inventory `store_snapshot`, InMemory, and PG dual-track current roles plus retirement/retention conditions.
- Wave 2B: freeze the direct God Object entrypoints, migration waves, and owners.
- Wave 2C: freeze the test matrix, PG-first priority domains, compatibility-cache boundary, and dual-write acceptance semantics.

From the detail plan, this phase is meant to address G2 `#11-#16`, with this closure shape:

- `#11` the JSONB God Object risk becomes an explicit remediation strategy.
- `#12` remaining production `store.snapshot()` / `store.transact()` usage gets a concrete inventory and priority.
- `#13` direct operator/admin entrypoints that bypass repositories get a closure rule.
- `#14` InMemory / PG dual-track owner and testing posture are frozen.
- `#15` `store_snapshot` deletion/retention conditions are explicit.
- `#16` dual-write acceptance/monitoring or compatibility-cache synchronization facts are explicit.

## Expected Deliverables

Produce the minimum coherent Phase 2 outcome. That can include:

- Documentation freezes in the remediation detail plan and the authoritative reference/testing docs.
- Guard/test documentation updates and focused truth tests where needed to prove the frozen current-state claims.
- Narrow source/test changes only if required to make the documentation truthful for this phase.

Do not try to complete Phase 3+ adapter work inside Phase 2.

## Verification

At minimum run:

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Also run the smallest plan-mandated validation justified by your changes:

- If you update truth-source or persistence/testing facts, run `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`.
- If you change snapshot-usage rules or persistence/runtime facts backed by tests, run the focused guard/tests that cover them, especially snapshot-usage and any directly touched runtime/persistence tests.
- Add broader runtime/deployment tests only if your change actually touches those boundaries.

## Report

Write your report to `.superpowers/sdd/phase-2-report.md` with:

- What you changed.
- Verification commands and results.
- Files changed.
- Self-review notes.
- Concerns, if any.
