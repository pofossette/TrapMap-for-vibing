# Task 3 Report: Retire Server AI Provider Compatibility Facade

## Outcome

Removed the server-owned compatibility provider facade after Tasks 1 and 2 moved provider contracts, configuration, and factory implementations to `@trapmap/ai-providers`.

Deleted:

- `packages/server/src/lib/ai/types.ts`
- `packages/server/src/lib/ai/provider-config.ts`
- `packages/server/src/lib/ai/providers.ts`
- `packages/server/src/lib/ai/provider-config.test.ts`
- `packages/server/src/lib/ai/providers.test.ts`

`packages/server/src/lib/ai/index.ts` no longer re-exports the retired provider/configuration/types facade. It retains the server-owned prompt/template, cache, and dynamic exports; parse remains available at its direct server path.

The retirement guard now asserts that the three implementation files are absent and that host-local shared infrastructure does not import `@trapmap/server/lib/ai`.

## TDD Evidence

RED was observed before deletion:

```text
rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts
1 failed, 37 passed
expected true to be false at the retired module existence assertion
```

GREEN after deletion:

```text
rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts
38 passed
```

## Documentation

- Added `packages/ai-providers` to `docs/PACKAGES.md` and the package navigation in `docs/README.md`.
- Recorded the precise RED/GREEN evidence in the active compatibility-retirement detail.
- The new `packages/ai-providers/README.md` is the minimal repository-required package artifact. It states that the package owns provider contracts/configuration/factory behavior, while server keeps prompt/cache/parse/dynamic helpers.

## Verification

- `rtk pnpm --filter @trapmap/server test --run src/lib/ai/index.test.ts` (1 passed)
- `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts` (38 passed)
- `rtk pnpm typecheck` (no errors)
- `rtk pnpm check:docs-drift` (46 rules passed)
- `rtk pnpm check:structure` (passed)
- `rtk git diff --check` (passed)

## Scope And Remaining Edge

The first structure check failed because the Task 1 `packages/ai-providers` addition lacked the repository-mandated package README. After root authorization, the minimal README was added and the rerun passed.

`packages/host-local/src/nest/runtime/shared-infra.ts` still imports server graph-query code. That edge remains outside this task and is the remaining file-level Wave-8 `@trapmap/server` allowlist basis. Wave-8 remains open.
