# Phase 1 Brief: Server / Backend-Core 边界整改

Source plan: `plan.md` and `docs/todos/trapmap-architecture-remediation-plan.md`

## Goal

Complete Phase 1 of the TrapMap architecture remediation plan. This phase is allowed to include code changes where needed, but it must stay scoped to `server` / `backend-core` / `service-*` / `host-*` boundary facts and the minimum supporting tests and docs.

## Binding Global Constraints

- Every checkbox can only be closed when structure conclusion or code remediation, affected tests, documentation write-back, `rtk pnpm check:docs-drift`, and `rtk pnpm check:structure` are all complete.
- Root `plan.md` stays an index only.
- Prefer `docs/reference/SYSTEM_TRUTH_SOURCES.md` and source entries on fact conflicts.
- Do not add a parallel phase document.
- Documentation must not describe future state as current state.
- Use `rtk` prefix for shell commands.
- Follow existing repository patterns; do not invent new architecture layers unless the phase requires them.

## Required Inputs to Read First

- `docs/todos/trapmap-architecture-remediation-plan.md` — Phase 1 section
- `packages/server/src/app.ts`
- `packages/server/src/config.ts`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/PACKAGES.md`

Then read only the additional source files needed to satisfy the phase.

## Phase 1 Requirements

Close these Phase 1 waves:

- Wave 1A: close the `packages/server` compatibility-shell role and identify remaining primary-business entrypoints still living there.
- Wave 1B: freeze owner boundaries and transition state for `backend-core`, repositories, schema, and migrations.
- Wave 1C: freeze responsibility boundaries for `service-*`, `host-*`, and the shared runtime seam.
- Wave 1D: write back corresponding truth-source / packages docs and focused test entrypoints.

From the detail plan, this phase is meant to address G1 `#1-#10`, with this closure shape:

- `#1` compatibility shell no longer described as application主体 without quantified evidence and owner.
- `#2` `server` and `backend-core` import/runtime closure direction is explicit.
- `#3` route migration priority remaining in `server` is defined.
- `#4` repository interface target package is frozen.
- `#5` Drizzle schema / migration owner strategy is frozen.
- `#6` `backend-core` “interfaces only” state has a closure path.
- `#7` high-complexity domain logic left in `server` has a migration layering plan.
- `#8` AI provider / prompt / caching core-port and adapter boundary is defined.
- `#9` persistence implementation reuse path is defined.
- `#10` `service-*` role and future boundary is written as current documentation fact.

## Expected Deliverables

Produce the minimum coherent Phase 1 outcome. That can include:

- Documentation freezes in `docs/todos/trapmap-architecture-remediation-plan.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`, `docs/PACKAGES.md`, and any other necessary architecture/reference docs.
- Focused code restructuring only if required to make the documentation truthful for this phase.
- Focused tests or test-entry documentation updates that prove the changed boundary facts.

Do not try to complete later phases inside Phase 1.

## Verification

At minimum run:

- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Also run the smallest plan-mandated validation justified by the files you touch:

- If you change `packages/server`, `backend-core`, `service-*`, `host-*`, runtime boundary, or startup facts: run affected focused tests, and add `rtk pnpm test:runtime-foundations` or `rtk pnpm test:deployment-smoke` if the changed boundary requires it.
- If you only change docs for facts already proven by current source and tests, keep verification minimal and evidence-based.

## Report

Write your report to `.superpowers/sdd/phase-1-report.md` with:

- What you changed.
- Verification commands and results.
- Files changed.
- Self-review notes.
- Concerns, if any.
