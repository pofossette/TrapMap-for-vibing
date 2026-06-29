# Phase 0 Brief: 盘点冻结与计划归并

Source plan: `plan.md` and `docs/todos/trapmap-architecture-remediation-plan.md`

## Goal

Complete Phase 0 of the TrapMap architecture remediation plan as a documentation / structure freeze phase. Do not implement runtime architecture changes in this phase.

## Binding Global Constraints

- Every checkbox can only be closed when structure conclusion or code remediation, affected tests, documentation write-back, `rtk pnpm check:docs-drift`, and `rtk pnpm check:structure` are all complete.
- Root `plan.md` stays an index only. Execution detail, issue pool, frozen boundaries, documentation matrix, and test matrix belong in `docs/todos/trapmap-architecture-remediation-plan.md`.
- If architecture facts conflict, prefer `docs/reference/SYSTEM_TRUTH_SOURCES.md` and source entries.
- Do not add a new parallel Phase document for this same architecture remediation topic.
- Documentation must not describe target/future state as current state.
- Use `rtk` prefix for shell commands.

## Phase 0 Requirements

Update the active remediation detail plan and related index/truth-source docs so Phase 0 closes these items:

- Wave 0A: Map the 30 issues into 5 governance themes and freeze priority so later work does not devolve into point patches.
- Wave 0B: Mark which issues must close via code remediation, and which may close first by freezing documentation facts and deferred conditions.
- Wave 0C: Clarify historical document roles:
  - `docs/todos/nestjs-service-evolution-*.md` are service-evolution background inputs.
  - `docs/todos/backend-build-targets-plan.md` is host/server-shape background input.
  - `docs/todos/backend-engineering-optimization-plan.md` is the platform deferred issue pool.
- Wave 0D: Freeze non-goals for this round:
  - Do not directly introduce a full service discovery system, K8s platform, or MQ product replacement.
  - Do not rewrite all historical designs just to clean documentation; only consolidate entry points and align truth sources.
  - Do not rewrite all tests to PG-first in one round; first freeze priority domains and entry criteria.
- Wave 0E: Freeze unified adapter non-goals:
  - Do not mix repository, application service, and gateway client into a mega-adapter.
  - Do not sacrifice current default-path clarity for provider pluggability.
  - Do not force all domains to migrate in the first round.

Also make Phase 0 satisfy the root plan's current key path for Phase 0:

- Single issue pool and priorities are frozen.
- Deferred entry is clear.
- Current root index and only active detail plan are clear.
- Unified adapter is written as an explicit goal of this remediation line, not an implicit store_snapshot side-effect.

## Expected Documentation Work

- `docs/todos/trapmap-architecture-remediation-plan.md`: add the Phase 0 issue classification / deferred table / historical input roles / non-goals; check off Phase 0 boxes only when evidence exists in this same change.
- `plan.md`: reflect Phase 0 completion in the phase index and current key path without adding details that belong in the detail plan.
- `docs/README.md`, `docs/todos/README.md`, `docs/archived/README.md`: ensure entry-point language matches the single active root/detail plan and the background/deferred roles.
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`: ensure the current active architecture remediation entry replaces stale active closeout entries.
- `docs/reference/REPO_STRUCTURE.md` and `docs/PACKAGES.md`: only update if needed to remove stale “current long-term target” pointers that contradict the new active root/detail plan.

## Verification

Run at minimum:

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

If you change commands, scripts, source code, shared types, runtime behavior, or eval/retrieval/governance behavior, add the relevant plan-mandated focused verification. Phase 0 should normally be documentation-only.

## Report

Write your report to `.superpowers/sdd/phase-0-report.md` with:

- What you changed.
- Verification commands and results.
- Files changed.
- Self-review notes.
- Concerns, if any.
