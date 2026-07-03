# Phase 1 Brief: Platform-Neutral Schema And Adapter Interface

Implement Phase 1 from `docs/todos/agent-eval-framework-evaluation-and-plan.md`.

Requirements:
- Add `packages/contracts/src/domain/evals/platform.ts`.
- Add `packages/contracts/src/domain/evals/platform.test.ts`.
- Export the new contracts from `packages/contracts/src/domain/evals/index.ts`.
- Add `evals/lib/platform/types.ts`.
- Add `evals/lib/platform/adapter.ts`.
- Add `evals/lib/platform/noop-adapter.ts`.
- Add `evals/lib/platform/json-archive-adapter.ts`.
- Wire the platform layer into the eval entry path by updating:
  - `evals/scripts/eval-all.ts`
  - `scripts/run-eval.ts`
- Define platform-neutral schema for run, event, score, and trace step.
- Export a unified `EvalPlatformAdapter` interface.
- Implement a default `noop` adapter.
- Implement a local `json archive` adapter that writes mirrored platform events to `reports/`.
- Adapter failure must only emit warnings and must not change eval exit codes.
- When no platform adapter is enabled, existing eval behavior must remain unchanged.

Design constraints:
- Do not rewrite existing per-suite report schemas.
- Keep platform model parallel to existing report contracts, not a replacement.
- Preserve current CLI defaults and existing JSON report behavior.
- Favor minimal abstractions needed for Phase 2; do not prebuild Langfuse or MLflow specifics yet.

TDD requirements:
- Write the new failing tests first and verify they fail for the intended reason before implementation.

Required validation:
- `rtk pnpm --filter @trapmap/contracts test --run packages/contracts/src/domain/evals/platform.test.ts`
- `rtk pnpm test:file -- evals/scripts/__tests__/eval-ci.test.ts`
- `rtk pnpm eval -- agent-planning --tier smoke --dry-run`
- `rtk pnpm typecheck`

Deliverables:
- New platform contracts and adapter layer.
- Minimal entry-point wiring needed for later suite integration.
