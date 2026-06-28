# Phase 4 Adapter Env / Target-Pruning Freeze Report

## Scope

- Task type: documentation/truth-source freeze only
- Runtime behavior changes: none
- Primary truth sources used:
  - `packages/server/src/config.ts`
  - `packages/host-local/src/nest/config/config.ts`
  - `packages/host-distributed/src/config/service-config.ts`

## Changes

- Added `Phase 4 closure freeze (G3 env / target matrix)` to `docs/todos/trapmap-architecture-remediation-plan.md`.
- Added a Phase 4 truth-source row and explicit Phase 4 freeze fact to `docs/reference/SYSTEM_TRUTH_SOURCES.md`.
- Added `Phase 4 Adapter env / target-pruning freeze` to `docs/PACKAGES.md`.
- Added `Phase 4 freeze` selector-env / provider-specific-env / fail-fast posture section to `docs/operations/ENVIRONMENT.md`.
- Added `Phase 4 freeze` recommended profile/target combinations and target-pruning wording to `docs/architecture/DEPLOYMENT.md`.
- Added `Phase 4 Adapter Env / Target Freeze Checks` to `docs/operations/TESTING.md`.

## Frozen facts

- Selector env truth is centered on `TRAPMAP_DEPLOYMENT_PROFILE`, `TRAPMAP_DEPLOYMENT_PRESET`, and `TRAPMAP_TASK_TRANSPORT`.
- Provider-specific env remains owner-specific rather than being rewritten as a generic mega-config taxonomy.
- Current provider-specific facts explicitly include AI provider env and distributed internal service URL env.
- Recommended combinations are frozen as:
  - `local-agent` -> `light` with in-process/internal defaults and `json-store-ok`
  - `team-monolith` -> `light` with `postgres-required` + `gateway-core` + `split-owned`
  - `distributed` -> `heavy` with service/gateway split and `remote-expected`
- Fail-fast / fallback rules are frozen as:
  - `rabbitmq` requires RabbitMQ config
  - `distributed` requires PostgreSQL
  - `local-agent` may remain `json-store-ok`
  - internal service URLs are ignored in `in-process` mode
- `light` and `heavy` are frozen as build/deployment targets, not new runtime profiles.
- optional dependency / tree-shaking language is frozen as intent/non-goal only, not as a claim of completed automated pruning.

## Validation

- Command: `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - Result: PASS
  - Detail: `✓ |server| src/__tests__/docs-truth-smoke.test.ts (37 tests)`, `Test Files 1 passed`, `Tests 37 passed`
- Command: `rtk pnpm check:docs-drift`
  - Result: PASS
  - Detail: `[doc-drift] All 33 doc rule(s) passed.`
- Command: `rtk pnpm check:structure`
  - Result: PASS
  - Detail: `[structure-guard] All checks passed.`

## Closeout

- Wave 4A: closed after selector env / provider-specific env freeze text and truth-source/docs updates landed.
- Wave 4B: closed after recommended combinations and fail-fast / fallback rules were frozen in remediation, environment, deployment, and testing docs.
- Wave 4C: closed after `light` / `heavy` target-pruning posture was frozen as a documentation boundary and the focused validation matrix passed.
