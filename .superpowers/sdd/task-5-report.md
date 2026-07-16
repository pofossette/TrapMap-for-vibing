# Task 5 — Wave-3 foundation review report

## Scope

Reviewed the dirty Wave-3 candidate-ingestion foundation: owner-local Drizzle schema and migration guard, PostgreSQL owner bundle, host-local and distributed composition, trusted-actor forwarding, duplicate domain, source-first test resolution, and retirement guard coverage. This package does not close Wave-3; compatibility repositories, worker/recovery, and public API ownership remain for later packages.

## RED → GREEN

1. Added `does not retain the deprecated persistence-schema project reference` to `pg-ports.test.ts`.
2. RED: the focused `pg-ports` suite failed because `packages/service-candidate-ingestion/tsconfig.json` still referenced `../persistence-schema`.
3. GREEN: removed that obsolete project reference. The full candidate-ingestion focused suite now passes (25 tests).
4. Refactored the PG row timestamp mapping and candidate status transaction to remove the two new Fallow complexity findings without changing status or idempotency behavior. The PG owner suite remains green (17 tests).

## Verification

- `rtk pnpm --filter @trapmap/service-candidate-ingestion test --run src/pg-ports.test.ts src/migrations.test.ts src/routes.test.ts` — 25 passed.
- `rtk pnpm --filter @trapmap/service-candidate-ingestion typecheck` — passed.
- `rtk pnpm --filter @trapmap/host-local test --run src/nest/runtime/host-services.test.ts src/nest/gateway/candidate-review.controller.test.ts` — 4 passed.
- `rtk pnpm exec vitest run --project host-distributed packages/host-distributed/src/gateway/routes.test.ts` — 23 passed.
- `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts` — 16 passed.
- `rtk pnpm typecheck` — passed.
- `rtk pnpm check:docs-drift` — 46 rules passed.
- `rtk pnpm check:structure` — passed.
- `rtk git diff --check` — passed.

## Fallow

`rtk pnpm exec fallow audit --base main --gate new-only --format json --quiet` completes with verdict `warn`: zero new dead-code issues, zero boundary violations, and zero new complexity findings after the refactor. It retains 12 introduced duplication groups, chiefly the intentional owner-local schema/PG port parity with legacy candidate persistence and repeated route templates. No suppression was added; this remains closeout evidence for the later deletion/migration packages rather than a Wave-3 completion claim.

## Remaining Wave-3 work

Server/runtime-infra candidate, duplicate, and lineage compatibility implementations; candidate processor/worker/recovery; public host API compatibility; and retirement allowlist removal remain out of scope for this foundation baseline.
