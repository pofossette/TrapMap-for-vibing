# Task 5: Delete Smoke Test + Update Documentation

## Task Description

Delete the old `docs-truth-smoke.test.ts` (now fully replaced by docRules + arch-freeze) and update all documentation references.

### Part 1: Delete the smoke test

Delete `packages/server/src/__tests__/docs-truth-smoke.test.ts`.

This file was the original 880-line smoke test. All its assertions have been migrated to:
- `scripts/complexity-budgets.json` (doc-only assertions, ~43 rules)
- `scripts/arch-freeze-rules.json` (source-code assertions, 8 rule groups)

The smoke test should no longer be needed. However, verify that no other test files or scripts import from it before deleting.

### Part 2: Update documentation references

The following docs may still reference the smoke test or need updates:

1. **`docs/operations/TESTING.md`** — Update the Phase freeze checks section to reference the new tools instead of the smoke test file. The smoke test was mentioned in the "Phase 3/4/5/6/7 Unified Adapter Freeze Checks" sections.

2. **`docs/reference/SYSTEM_TRUTH_SOURCES.md`** — Verify the Phase 7 entry references the new scripts (`check:deps`, `check:arch-freeze`, `check:docs-drift`, `check:md-lint`). Task 4 already updated this, but verify it's current.

3. **`docs/PACKAGES.md`** — Verify the Phase 1-6 boundary descriptions are current with the new check scripts.

4. **`docs/operations/CI_CD.md`** — Task 4 already updated this, but verify the `doc-guardrails` job description is accurate.

### Part 3: Verify everything still works

After deleting the smoke test, run the full check suite to confirm nothing breaks:

1. `pnpm check:docs-drift` — should pass
2. `pnpm check:arch-freeze` — should pass
3. `pnpm check:deps` — should pass
4. `pnpm check:mermaid` — should pass
5. `pnpm check:structure` — should pass
6. `pnpm check:md-lint` — should pass
7. `pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts` — should pass
8. `pnpm exec vitest run scripts/__tests__/check-arch-freeze.test.ts` — should pass

## Context

- The smoke test was already updated in Task 4 to reference the new `doc-guardrails` job name
- All its assertions have been migrated to config-driven systems
- The `docs-truth-smoke.test.ts` file is 880 lines and should be completely removed

## Key Files

- `packages/server/src/__tests__/docs-truth-smoke.test.ts` — DELETE this file
- `docs/operations/TESTING.md` — update references
- `docs/reference/SYSTEM_TRUTH_SOURCES.md` — verify/update
- `docs/PACKAGES.md` — verify/update
- `docs/operations/CI_CD.md` — verify/update

## Your Job

1. Check if anything imports from the smoke test file (grep for the filename)
2. Delete `packages/server/src/__tests__/docs-truth-smoke.test.ts`
3. Update `docs/operations/TESTING.md` to remove smoke test references and add new script references
4. Verify `docs/reference/SYSTEM_TRUTH_SOURCES.md` is current (Task 4 already updated it)
5. Verify `docs/PACKAGES.md` is current
6. Verify `docs/operations/CI_CD.md` is current (Task 4 already updated it)
7. Run the full check suite listed in Part 3 to verify everything works
8. Commit your work

## Work From

/home/wunai/Disks/Data/my-project/Trap-Map
