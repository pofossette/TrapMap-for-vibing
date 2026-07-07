# Task 1 Report: Foundation Tools — dependency-cruiser + TypeDoc + mustMatchRegex

## What was implemented

### 1A: dependency-cruiser
- Installed `dependency-cruiser@^18.0.0` as a root devDependency.
- Created `.dependency-cruiser.cjs` with 5 forbidden rules enforcing layer boundaries:
  1. `contracts-is-foundation` — contracts must not depend on any other workspace package
  2. `backend-core-only-depends-contracts` — backend-core may only depend on contracts
  3. `server-no-host-deps` — server must not depend on host-* packages
  4. `services-must-not-cross-dep` — service-* packages must not depend on each other (6 per-service rules with self-exclusion via pathNot)
  5. `web-panel-server-isolation` — web-panel must not import from server, backend-core, or host-*
- Options: `tsPreCompilationDeps: true`, `tsConfig: { fileName: 'tsconfig.base.json' }`, `enhancedResolveOptions` with exportsFields and conditionNames.
- Added `check:deps` script to package.json.

### 1B: TypeDoc
- Installed `typedoc@^0.28.19` as a root devDependency.
- Created `typedoc.json` with entryPointStrategy "packages", entryPoints contracts + backend-core, output to docs/api.
- Added `docs:api` script to package.json.

### 1C: mustMatchRegex in check-doc-drift.ts
- Added `mustMatchRegex?: string[]` field to `DocRule` interface with JSDoc.
- Added implementation in `checkRule()` that iterates patterns, creates RegExp with 's' flag, tests content, and reports failures/errors.
- Added 6 unit tests covering: regex match pass, regex mismatch fail, invalid regex error, multiline matching via 's' flag, empty array edge case, partial match (all patterns must match).

## What was tested and test results

1. **`pnpm check:deps`** — Passed. 0 violations, 1009 modules, 4085 dependencies cruised.
2. **`pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts`** — All 28 tests passed (22 pre-existing + 6 new mustMatchRegex tests).

## Self-review findings

- The initial `.dependency-cruiser.cjs` used invalid `dependencyTypes` values (`aliased-subpath` does not exist in v18). Removed `dependencyTypes` filters entirely since the `path` regex on `to` already restricts cross-package matches when combined with `pathNot` for same-package exclusion.
- The `services-must-not-cross-dep` rule cannot use regex backreferences in `pathNot`, so it was expanded to one rule per service package (6 rules) each with a correct `pathNot` self-exclusion pattern.
- The existing `contracts-is-foundation` rule fires on internal file-to-file deps within contracts when `pathNot` is absent — adding `pathNot: '^packages/contracts/'` was required to exclude intra-package imports.

## Files changed

| File | Change |
|---|---|
| `.dependency-cruiser.cjs` | New — layer-boundary rules |
| `typedoc.json` | New — TypeDoc config |
| `package.json` | Added dependency-cruiser, typedoc devDeps; added check:deps, docs:api scripts |
| `pnpm-lock.yaml` | Updated by pnpm install |
| `scripts/check-doc-drift.ts` | Added mustMatchRegex to DocRule interface + checkRule() |
| `scripts/__tests__/check-doc-drift.test.ts` | Added 6 mustMatchRegex tests |

## Issues or concerns

None. All checks pass, all tests green.
