# Task 4 Report: CI Pipeline + run-ci.ts + Pre-commit Hook Updates

## Status: DONE

## Changes Made

### Primary (Task Brief)
1. **`.github/workflows/ci.yml`** -- Removed `architecture-guardrails` and `doc-rules` jobs. Added single `doc-guardrails` job with all 8 check steps (docs-drift, arch-freeze, deps, mermaid, structure, complexity, md-lint, links). CI job count: 8 -> 7.
2. **`scripts/run-ci.ts`** -- Added 4 new steps to STEPS array: `check:arch-freeze`, `check:deps`, `check:md-lint`, `check:links`. STEPS count: 8 -> 12.
3. **`.husky/pre-commit`** -- Added `pnpm check:md-lint || exit 1` after existing checks.

### Cascading Updates (required for consistency)
4. **`scripts/arch-freeze-rules.json`** -- Updated phase7 rule to expect `doc-guardrails:` instead of `architecture-guardrails:` in ci.yml.
5. **`scripts/complexity-budgets.json`** -- Updated mustContain strings to reference `doc-guardrails` job and its full command list.
6. **`docs/operations/CI_CD.md`** -- Updated job table, descriptions, and guardrail section to reference `doc-guardrails`.
7. **`docs/operations/TESTING.md`** -- Updated CI guard reference from two jobs to single `doc-guardrails`.
8. **`docs/reference/SYSTEM_TRUTH_SOURCES.md`** -- Updated Phase 7 CI truth freeze text and CI Guards section.
9. **`packages/server/src/__tests__/docs-truth-smoke.test.ts`** -- Updated 4 test assertions to reference `doc-guardrails`.

## Verification

- CI YAML validation: valid (7 jobs confirmed)
- `pnpm check:deps`: PASS (1009 modules, 4085 dependencies cruised)
- `pnpm check:arch-freeze`: PASS (all 8 rules passed)
- `pnpm check:md-lint`: PASS (212 files, 0 errors)
- `pnpm check:links`: runs correctly (non-blocking in CI via `|| true`)
- `docs-truth-smoke.test.ts`: PASS (49 pass, 0 fail)
- Pre-commit hook: all checks passed during commit

## Commit

- **c3cd2fad** `ci: merge architecture-guardrails + doc-rules into doc-guardrails, update run-ci and pre-commit`

## Concerns

None. The `check:links` script (`markdown-link-check`) produces non-zero exit when files have no hyperlinks, but this is handled with `|| true` in CI as specified in the brief.
