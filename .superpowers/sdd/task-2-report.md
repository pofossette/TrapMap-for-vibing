# Task 2 Report: Migrate Provider And Configuration Consumers

## Status

Completed the provider/config consumer migration against the public
`@trapmap/ai-providers` API introduced by Task 1 (`11be87b1`). Server provider
modules remain in place. The shared-infra file-level `@trapmap/server` allowlist
was retained because graph-query remains out of scope.

## Changed Files

- `packages/host-local/src/nest/runtime/shared-infra.ts`
- `packages/host-local/src/nest/runtime/import-boundary.test.ts`
- `packages/host-local/package.json`
- `packages/server/src/app.ts`
- `packages/server/src/config.ts`
- `packages/server/src/lib/context.ts`
- `packages/server/src/lib/embeddings.ts`
- `packages/server/src/lib/indexing/pipeline.ts`
- `packages/server/src/lib/indexing/events.ts`
- `packages/server/src/lib/indexing/skill-events.ts`
- `packages/server/src/lib/indexing/artifact-pipeline.ts`
- `packages/server/src/lib/indexing/skill-graph-build.ts`
- `packages/server/src/lib/indexing/adapters/graph.ts`
- `packages/server/src/lib/indexing/adapters/artifact-graph.ts`
- `packages/server/src/lib/indexing/graph-lite/llm-extract.ts`
- `packages/server/src/lib/indexing/graph-lite/llm-extract-planning.ts`
- `packages/server/src/lib/pre-review.ts`
- `packages/server/src/lib/boundary-extract.ts`
- `packages/server/src/lib/artifacts/contextual-enrichment.ts`
- `packages/server/src/lib/artifacts/derive/types.ts`
- `packages/server/src/lib/labels/graph-align.ts`
- `packages/server/src/lib/labels/llm-align.ts`
- `packages/server/src/lib/labels/backfill.ts`
- `packages/server/src/lib/labels/candidate-recall.ts`
- `packages/server/src/lib/retrieval/capsules/intent.ts`
- `packages/server/src/testing/mock-factories.ts`
- `packages/server/src/lib/__tests__/types-export.test.ts`
- `packages/server/src/lib/artifacts/contextual-enrichment.test.ts`
- `packages/server/src/lib/boundary-extract.test.ts`
- `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`
- `packages/server/src/lib/labels/llm-align.test.ts`
- `packages/server/src/lib/pre-review.test.ts`
- `packages/server/package.json`
- `scripts/label-runner.ts`
- `scripts/__tests__/compatibility-retirement-guard.test.ts`
- `evals/label-alignment/lib/decision-eval.ts`
- `evals/label-alignment/lib/decision-eval.test.ts`
- `evals/graph-extraction/run.ts`
- `evals/graph-extraction/dedup-eval.ts`
- `evals/graph-extraction/conflict-eval.ts`
- `package.json`
- `pnpm-lock.yaml`

## Validation

- `rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts`
  - Expected red test: failed because `shared-infra.ts` imported
    `createAiProviders` and `AiProviders` from `@trapmap/server/lib/ai/index.js`.
- `rtk pnpm install --lockfile-only`
  - Passed; lockfile updated. It emitted only existing transitive-dependency deprecation warnings.
- `rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts packages/host-local/src/nest/runtime/host-services.test.ts`
  - Passed: 2 files, 12 tests.
- `rtk pnpm --filter @trapmap/server test --run src/lib/indexing/graph-lite/llm-extract.test.ts src/lib/boundary-extract.test.ts src/lib/labels/llm-align.test.ts`
  - Failed before provider behavior because package-filtered pnpm runs with `packages/server` as CWD. Prompt construction resolves
    `packages/server/docs/reference/system-prompt-slots.default.json`, which does not exist.
- `rtk pnpm exec vitest run packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts packages/server/src/lib/boundary-extract.test.ts packages/server/src/lib/labels/llm-align.test.ts`
  - Passed from the repository root: 3 files, 72 tests.
- `rtk pnpm typecheck`
  - Passed: `TypeScript: No errors found`.
- `rtk pnpm exec vitest run scripts/__tests__/compatibility-retirement-guard.test.ts`
  - Passed: 1 file, 37 tests.
- `rtk git diff --check`
  - Passed with no whitespace errors.

## Self-Review

- Confirmed all targeted provider/config consumers import from
  `@trapmap/ai-providers`.
- Confirmed the remaining server AI provider-path imports are limited to the
  allowed server-local dynamic/cache prompt helper modules.
- Confirmed server, host-local, and root script/eval consumers declare the
  shared package as a workspace dependency and that `pnpm-lock.yaml` matches.
- Confirmed no server provider implementation was deleted and no graph-query
  compatibility allowlist entry was removed.

## Concerns

The exact package-filtered server test command has a pre-existing CWD-sensitive
prompt-template lookup failure. The root-coordinated equivalent passes all the
same named tests. No prompt production behavior was changed as part of this
migration.
