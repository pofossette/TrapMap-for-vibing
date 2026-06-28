# Phase 2 Report

## What changed

- Closed Phase 2 in `docs/todos/trapmap-architecture-remediation-plan.md` with an explicit G2 `#11-#16` closure freeze for `store_snapshot`, InMemory fallback, PG-first truth, direct God Object entrypoints, migration waves, retention gates, compatibility-cache boundary, and dual-write acceptance semantics.
- Added a Phase 2 truth-source row and rule text in `docs/reference/SYSTEM_TRUTH_SOURCES.md` so the current `store_snapshot` / PG-first posture has one authoritative reference.
- Added a matching documentation-truth row in `docs/reference/DOCS_TRUTH_MATRIX.md`.
- Added a Phase 2 package-level freeze section in `docs/PACKAGES.md`, and corrected the earlier overstatement that access-key/member/team flows were already fully off compatibility fallback in all modes.
- Updated `docs/architecture/components/PERSISTENCE.md` so it now states the actual posture: PostgreSQL is the authoritative production backend, while JsonStore / `store_snapshot` remain compatibility/fallback carriers.
- Updated `docs/operations/TESTING.md` with an explicit Phase 2 verification bucket: snapshot allowlist, PG-first compatibility, and truth-freeze checks.
- Strengthened `packages/server/src/__tests__/snapshot-usage-guard.test.ts` with a Phase 2 freeze assertion over key compatibility buckets.
- Strengthened `packages/server/src/__tests__/docs-truth-smoke.test.ts` to verify the new Phase 2 freeze across the remediation plan, truth source, packages doc, persistence doc, testing doc, and named live source/test files.

## Verification commands and results

- `rtk pnpm test:file -- packages/server/src/__tests__/snapshot-usage-guard.test.ts` -> PASS
- `rtk pnpm test:file -- packages/server/src/__tests__/pg-first-compat.test.ts` -> PASS
- `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts` -> PASS
- `rtk pnpm check:docs-drift` -> PASS
- `rtk pnpm check:structure` -> PASS

## Files changed

- `docs/todos/trapmap-architecture-remediation-plan.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/DOCS_TRUTH_MATRIX.md`
- `docs/PACKAGES.md`
- `docs/architecture/components/PERSISTENCE.md`
- `docs/operations/TESTING.md`
- `packages/server/src/__tests__/snapshot-usage-guard.test.ts`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `.superpowers/sdd/phase-2-report.md`

## Self-review notes

- Scope stayed inside the Phase 2 write surface: remediation detail freeze, authoritative docs, testing guidance, and focused truth/guard tests.
- I did not move any runtime code toward Phase 3+ adapter work.
- I corrected one inaccurate secondary-doc claim instead of “fixing” runtime code that still intentionally supports no-PG / InMemory fallback.
- The new smoke assertions check both prose and named live files (`read-model.ts`, `artifacts-activate.ts`, guard tests), so the freeze is tied to real compatibility seams.

## Concerns

- The current allowlist still includes several compatibility-shell and operator/admin entrypoints. Phase 2 now freezes that inventory and migration order, but it does not reduce the runtime surface yet; that remains later-phase work by design.
