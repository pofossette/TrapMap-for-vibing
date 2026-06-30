# Task 5: Delete Smoke Test + Update Documentation

## Status: DONE

## What Was Done

### 1. Deleted the smoke test file

Removed `packages/server/src/__tests__/docs-truth-smoke.test.ts` (880 lines, ~49 test cases). All its assertions have been fully migrated to:
- `scripts/complexity-budgets.json` (docRules, 43 rules)
- `scripts/arch-freeze-rules.json` (source-code assertions, 8 rule groups)

### 2. Updated all documentation references

**`package.json`**: Removed `docs-truth-smoke.test.ts` from the `test:runtime-foundations` script.

**`scripts/complexity-budgets.json`**: Removed 3 entries from the TESTING.md docRule that referenced the smoke test file path and `rtk pnpm test:file` commands.

**`docs/operations/TESTING.md`**: Updated all Phase freeze check sections:
- Phase 2 Truth freeze: now uses `pnpm check:docs-drift` instead of smoke test
- Phase 3 Unified Adapter Freeze Checks: removed smoke test from verification matrix
- Phase 4 Closeout Matrix: removed smoke test from Phase 0 and Phase 1 entries
- Phase 4 Adapter Env / Target Freeze Checks: removed smoke test from matrix
- Phase 5 Distributed Baseline Freeze Checks: removed smoke test from matrix
- Phase 6 Mature Capability Freeze Checks: removed smoke test from matrix
- Phase 7 Maintainability / CI-Testing Truth / Documentation Closeout Checks: replaced smoke test with `check:deps`, `check:md-lint`, `check:links`
- Backend Engineering Master Plan Phase 4 Closeout Matrix: removed smoke test from Phase 0
- Runtime Foundations Verification: replaced smoke test with `check:docs-drift`, `check:deps`, `check:md-lint`, `check:links`
- Documentation maintenance workflow: removed step 5 that ran smoke test
- Verification matrix by change type: replaced smoke test with `check:deps` + `check:md-lint`
- Master phase minimum verification matrix: updated Phase 0, 1, 3 entries
- Server Raw Report Revalidation section: removed smoke test from regression frozen tests and replaced the standalone run command with `pnpm check:docs-drift`
- Updated note about "runtime doc contract" to reference `scripts/complexity-budgets.json` instead of the smoke test

**`docs/reference/SYSTEM_TRUTH_SOURCES.md`**: 
- Phase 7 entry: replaced `packages/server/src/__tests__/docs-truth-smoke.test.ts` with `scripts/check-arch-freeze.ts` + `scripts/check-deps.ts` in the authoritative source list
- Maintenance section: removed the step that ran the smoke test

**`docs/guides/CONTRIBUTING.md`**: Replaced the "run docs truth smoke test" command with "run docs drift guard" (`pnpm check:docs-drift`).

**`docs/todos/backend-build-targets-plan.md`**: Removed the smoke test from the modified files list and minimum test section.

### 3. Verification files left untouched (correctly)

- `docs/operations/CI_CD.md` - Already current, references correct doc-guardrails commands
- `docs/PACKAGES.md` - No smoke test references, already current
- Archived plans under `docs/archived/` - Correctly left as historical references

## Check Suite Results

| Command | Result |
|---------|--------|
| `pnpm check:docs-drift` | All 43 doc rule(s) passed |
| `pnpm check:arch-freeze` | All 8 rule(s) passed |
| `pnpm check:deps` | No dependency violations found |
| `pnpm check:mermaid` | All 136 mermaid block(s) passed |
| `pnpm check:structure` | All checks passed |
| `pnpm check:md-lint` | 0 error(s) across 212 files |
| `pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts` | PASS (28) |
| `pnpm exec vitest run scripts/__tests__/check-arch-freeze.test.ts` | PASS (22) |
| `pnpm check:links` | Pre-existing dead links only (not related to this change) |

## Commits

To be created after this report.

## Concerns

None. All 880 lines of the old smoke test have been replaced by config-driven assertion systems, and all active documentation references have been updated to point to the new check scripts.
