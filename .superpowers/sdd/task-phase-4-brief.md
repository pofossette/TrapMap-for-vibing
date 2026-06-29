# Phase 4 Adapter Env / Target-Pruning Freeze

## Source requirements

Read these first and treat them as binding requirements:
- `plan.md` Phase 4 / Wave 4A-4C
- `docs/todos/trapmap-architecture-remediation-plan.md`
- `docs/operations/ENVIRONMENT.md`
- `docs/architecture/DEPLOYMENT.md`
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- `docs/PACKAGES.md`
- `docs/operations/TESTING.md`
- `packages/server/src/config.ts`
- `packages/host-local/src/nest/config/config.ts`
- `packages/host-distributed/src/config/service-config.ts`
- `packages/server/src/__tests__/docs-truth-smoke.test.ts` Phase 4 RED test

## Task

Complete Phase 4 as a documentation/truth-source freeze task, not a runtime refactor.

You must:
1. Add a `Phase 4 closure freeze` section to `docs/todos/trapmap-architecture-remediation-plan.md` and close Wave 4A-4C with explicit facts.
2. Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` with a Phase 4 truth-source row.
3. Update `docs/PACKAGES.md` with a dedicated `Phase 4 Adapter env / target-pruning freeze` section.
4. Update `docs/operations/ENVIRONMENT.md` with the frozen selector env / provider-specific env / fail-fast posture.
5. Update `docs/architecture/DEPLOYMENT.md` with the frozen recommended profile combinations and light/heavy target wording.
6. Update `docs/operations/TESTING.md` with a focused Phase 4 minimum verification matrix.
7. Make the new Phase 4 assertions in `packages/server/src/__tests__/docs-truth-smoke.test.ts` pass.

## Required freeze content

The Phase 4 freeze must explicitly state these boundaries:
- Selector env truth is centered on `TRAPMAP_DEPLOYMENT_PROFILE`, `TRAPMAP_DEPLOYMENT_PRESET`, and `TRAPMAP_TASK_TRANSPORT`.
- Provider-specific env remains specific to the owner seam rather than becoming a generic mega-config taxonomy; include AI provider env and distributed internal service URL env as current facts.
- Recommended combinations must clearly freeze:
  - `local-agent` -> `light` with in-process/internal defaults and JSON-store-ok posture
  - `team-monolith` -> `light` with PostgreSQL-required + gateway-core + split-owned async posture
  - `distributed` -> `heavy` with service/gateway split and remote-expected async posture
- Fail-fast / fallback rules must distinguish current accepted fallbacks from prohibited ambiguity. Examples: `rabbitmq` requires RabbitMQ config; `distributed` requires PostgreSQL; `local-agent` may stay JSON-store-ok; internal service URLs are ignored in `in-process` mode.
- Target-pruning posture must be frozen as a documentation boundary for now: `light` and `heavy` are build/deployment targets, not new runtime profiles; optional dependency / tree-shaking rules are frozen as current intent and non-goals, not claimed as fully implemented package-pruning automation unless the code proves it.
- Do not invent a stronger implementation claim than current code supports.

## Constraints

- Keep edits focused to the files above unless a minimal adjacent doc change is strictly needed.
- Do not introduce runtime behavior changes.
- Respect the Phase 1-3 freeze writing style.
- Shared repo: do not revert unrelated changes.

## Validation

Run focused checks:
- `rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts`
- `rtk pnpm check:docs-drift`
- `rtk pnpm check:structure`

Record exact commands and results in the report.
