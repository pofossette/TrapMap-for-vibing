# Phase 7 Maintainability / CI-Testing Truth / Documentation Closeout

## Source requirements

Read these first and treat them as binding requirements:
- `plan.md` Phase 7 / Wave 7A-7H
- `docs/todos/trapmap-architecture-remediation-plan.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/reference/REPO_STRUCTURE.md`
- `docs/README.md`
- `docs/todos/README.md`
- `docs/archived/README.md`
- `docs/operations/TESTING.md`
- `docs/operations/CI_CD.md`
- `docs/plans/README.md`
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/complexity-budgets.json`
- `scripts/check-doc-drift.ts`
- `scripts/check-structure.mjs`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts`

## Task

Complete Phase 7 as a documentation/guardrail closeout task, not a runtime refactor.

You must:
1. Add a `Phase 7 closure freeze` section to `docs/todos/trapmap-architecture-remediation-plan.md` and close Wave 7A-7H with explicit facts.
2. Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` with a Phase 7 truth-source row and a matching Phase 7 freeze rule entry.
3. Update the relevant doc index / truth docs so the current active plan, deferred landing spots, archived role, CI/testing truth, and eval command semantics are consistent:
   - `docs/README.md`
   - `docs/todos/README.md`
   - `docs/archived/README.md`
   - `docs/operations/TESTING.md`
   - `docs/operations/CI_CD.md`
   - `docs/reference/REPO_STRUCTURE.md` only if needed to freeze active-vs-archived structure truth
4. Strengthen the current drift/structure guardrails in `scripts/complexity-budgets.json` only as needed to cover the newly frozen Phase 7 truth.
5. Add the new Phase 7 assertions to `packages/server/src/__tests__/docs-truth-smoke.test.ts` and make them pass.
6. Only mark Wave 7A-7H complete if closure freeze text, truth-source/docs updates, guardrails, and focused validation results are all in place.

## Required freeze content

The Phase 7 freeze must explicitly state these boundaries:
- The current active execution surface remains only `plan.md` + `docs/todos/trapmap-architecture-remediation-plan.md`; historical plans/background docs must not be described as parallel active execution surfaces.
- Historical todo docs may remain as background/deferred references, but must be described accordingly rather than as current checklists still owned by the root plan.
- CI/testing truth must match the actual current files and commands:
  - `.github/workflows/ci.yml`
  - `package.json` scripts
  - `pnpm run ci`
  - `pnpm eval:smoke`
  - `pnpm eval:ci`
  - `pnpm eval:ci:core`
- Node version and job coverage wording must use the current exact facts from `.github/workflows/ci.yml`, not stale values from older docs.
- Phase 7 must explicitly freeze where deferred platform topics belong, rather than leaving them as ambiguous “later” work.
- Guardrails should cover the current active-remediation entry, archived/todos index truth, and eval/CI command drift where practical, without inventing behavior not enforced by code.
- Do not invent stronger implementation claims than current code/tests/docs support.

## Constraints

- Keep edits focused to the files above unless a minimal adjacent doc change is strictly needed.
- Do not introduce runtime behavior changes.
- Respect the Phase 1-6 freeze writing style.
- Shared repo: do not revert unrelated changes.

## Validation

Run focused checks:
- `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`
- `rtk pnpm eval:smoke`

Record exact commands and results in the report.
