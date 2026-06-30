# Task 2: Migrate Smoke Test + Create Arch-Freeze Script

## Task Description

Migrate the 880-line `docs-truth-smoke.test.ts` into two config-driven systems:
1. **Doc-only assertions** → `scripts/complexity-budgets.json` (extend existing docRules)
2. **Source-code architecture invariants** → new `scripts/check-arch-freeze.ts` + `scripts/arch-freeze-rules.json`

After this task, the smoke test should be **fully replaced** — ready for deletion in Task 5.

## Smoke Test Analysis

The smoke test at `packages/server/src/__tests__/docs-truth-smoke.test.ts` has ~50 test cases with ~457 `expect()` calls. They fall into these categories:

### Category A: Simple doc containment (~60% of assertions)
Tests that read ONE markdown file and assert `toContain`/`not.toContain`. These migrate directly to docRules in `complexity-budgets.json`.

**Mapping:**
- `expect(content).toContain('X')` → `"mustContain": ["X"]`
- `expect(content).not.toContain('X')` → `"mustNotContain": ["X"]`
- `expect(content).toMatch(/regex/)` → `"mustMatchRegex": ["regex"]`

### Category B: Multi-doc cross-references (~15%)
Tests that iterate multiple markdown files checking for shared strings. Split into one docRule per file.

Example: "key docs reference SYSTEM_TRUTH_SOURCES.md" checks both `README.md` and `docs/README.md` → two docRule entries.

### Category C: Source-code architecture invariants (~20%)
Tests that read `.ts` SOURCE files and assert architectural properties. These CANNOT go into docRules (docRules only handle markdown files). These migrate to `arch-freeze-rules.json`.

Examples:
- Phase 1 boundary: reads `app.ts`, `config.ts`, `internal-ports.ts`, `repos/index.ts`, `schema/index.ts`, `migration-runner.ts`
- Phase 2 freeze: reads `read-model.ts`, `artifacts-activate.ts`
- Phase 3 freeze: reads `adapter-factory.ts`, `remote.adapter.ts`, `shared-infra.ts`, etc.
- Phase 4 freeze: reads `serverConfig.ts`, `hostLocalConfig.ts`, `distributedServiceConfig.ts`
- Phase 5 freeze: reads `hostDistributedReadme`, `docker-compose.yml`, `distributedCloseoutTest`
- Phase 6 freeze: reads `resilience.ts`, `metrics.ts`, `cacheInvalidationSource`, `serverConfig.ts`, `graphConfig.ts`
- Phase 7 freeze: reads `plan.md`, `truthSources`, `docsIndex`, `ciWorkflow`, `packageJson`

### Category D: File existence checks (~5%)
Tests using `existsSync()`. These go into arch-freeze-rules.json as `"mustExist": true` entries.

## What to Implement

### Part 1: Migrate doc-only assertions to complexity-budgets.json

Read `packages/server/src/__tests__/docs-truth-smoke.test.ts` carefully. For each test case:

1. If it ONLY reads `.md` files and uses `toContain`/`not.toContain`/`toMatch`: add docRule entries
2. If it reads `.ts` source files: skip for Part 2
3. If it uses `existsSync`: skip for Part 2

**Important rules:**
- Do NOT duplicate existing docRules (37 already exist in complexity-budgets.json — read it first!)
- Merge with existing entries where a file already has a docRule
- For multi-doc tests, create one entry per file
- The JSON should be well-organized — group entries by file path

### Part 2: Create arch-freeze script

Create `scripts/arch-freeze-rules.json`:
```json
{
  "archFreezeRules": [
    {
      "id": "phase1-server-boundary",
      "description": "Phase 1 server/backend-core boundary freeze",
      "files": {
        "packages/server/src/app.ts": {
          "mustContain": ["...strings from smoke test..."]
        },
        "packages/server/src/config.ts": {
          "mustContain": ["...strings from smoke test..."]
        }
      }
    }
  ]
}
```

Create `scripts/check-arch-freeze.ts`:
- Follow the same pattern as `check-doc-drift.ts` (exported pure function, CLI entry point, clean error messages)
- Interface: `ArchFreezeRule { id, description, files: Record<string, { mustContain?, mustNotContain?, mustExist? }> }`
- Functions: `checkArchFreezeRule(rule, readFile) → string[]`, `checkArchFreeze(configPath, root) → CheckResult`
- CLI entry: reads config, iterates rules, reads each file, applies checks, reports failures
- Must handle file-not-found gracefully (same as check-doc-drift)

Create `scripts/__tests__/check-arch-freeze.test.ts`:
- Unit tests for `checkArchFreezeRule()` — same quality level as `check-doc-drift.test.ts`
- Test mustContain pass/fail, mustNotContain pass/fail, mustExist pass/fail, combined rules, invalid regex

Add script to `package.json`: `"check:arch-freeze": "pnpm exec tsx scripts/check-arch-freeze.ts"`

## Context

- The existing `scripts/check-doc-drift.ts` is the engine — well-structured, exported `checkRule()` function
- `scripts/complexity-budgets.json` has 37 existing docRules + 4 lineBudgets
- The smoke test is at `packages/server/src/__tests__/docs-truth-smoke.test.ts` (880 lines)
- Phase freeze tests in the smoke test read BOTH markdown AND source files in the same test — you must split these carefully
- Some Phase tests (Phase 1, 2, 3, 4, 5, 6, 7) read many files — these are the most complex to migrate

## Key Files

- `packages/server/src/__tests__/docs-truth-smoke.test.ts` — source of assertions to migrate
- `scripts/complexity-budgets.json` — existing docRules (37 entries) to extend
- `scripts/check-doc-drift.ts` — engine to follow as pattern
- `scripts/__tests__/check-doc-drift.test.ts` — test pattern to follow
- `package.json` — scripts to add to

## Your Job

1. Read the smoke test thoroughly
2. Read existing complexity-budgets.json to avoid duplicates
3. Add new docRules for all Category A and B assertions (doc-only tests)
4. Create arch-freeze-rules.json with all Category C assertions (source-code invariants)
5. Create check-arch-freeze.ts following the check-doc-drift.ts pattern
6. Create check-arch-freeze.test.ts with unit tests
7. Add `check:arch-freeze` script to package.json
8. Run `pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts` to verify docRules still pass
9. Run `pnpm exec vitest run scripts/__tests__/check-arch-freeze.test.ts` to verify arch-freeze tests pass
10. Run `pnpm check:arch-freeze` to verify the script works on the actual codebase
11. Commit your work

## Work From

/home/wunai/Disks/Data/my-project/Trap-Map
