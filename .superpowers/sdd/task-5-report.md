# Task 5 Report: Shared AI Provider Consolidation

## Status

Complete. Commit: `7605058` (`refactor: consolidate AI provider implementations`).

## Changes

- Deleted the host-local duplicate `ai-provider-config.ts`; `config.ts` now loads the shared AI provider configuration.
- Replaced the legacy embedding shim's local fallback/OpenAI selection with `createAiProviders(loadAiProviderConfig()).embeddings` while retaining the explicit global-provider bridge and its error fallback.
- Added migration contracts for the deleted host-local module, shared imports, removed local provider classes, and shared fallback equivalence.
- Split shared config and deterministic fallback embedding helpers to remove Fallow complexity findings. The Fallow `EmbeddingsProvider` member rule records legitimate interface-dispatched `embed()` calls rather than suppressing a finding.
- Added the retired host-local module to the compatibility guard. Graph-query files and the Wave-8 allowlist were not changed.

## Verification

- RED observed: host-local contract failed because `ai-provider-config.ts` existed; embedding contract failed because the shim still declared `FallbackEmbeddings`.
- `rtk pnpm --filter @trapmap/ai-providers test --run src/provider-config.test.ts src/providers.test.ts`: 19 passed.
- `rtk pnpm test:file -- packages/host-local/src/nest/config/import-boundary.test.ts`: 2 passed.
- `rtk pnpm test:file -- packages/server/src/lib/embeddings.test.ts`: 10 passed, including global-provider precedence and failing-global fallback.
- `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`: 38 passed.
- `rtk pnpm typecheck`: passed.
- Follow-up review coverage: `rtk pnpm test:file -- packages/server/src/lib/embeddings.test.ts`: 11 passed, including no-network shared Ollama selection and full shared-loader environment isolation for fallback paths.
- Follow-up provider regression: `rtk pnpm --filter @trapmap/ai-providers test --run src/provider-config.test.ts src/providers.test.ts`: 19 passed.

## Fallow Audit

`rtk pnpm exec fallow audit --base main` examined 78 changed files against `main` and excluded 70 inherited findings. Initial shared-provider findings were one unused class member plus two complexity findings (`loadAiProviderConfig` and `FallbackEmbeddings.embed`). After remediation, the audit emitted zero dead-code, complexity, or duplication findings for `packages/ai-providers` and this provider migration.

The branch-wide audit still reports 45 dead-code issues, 23 complexity findings, and 31 clone groups in prior changed files; none are in this task's provider migration surface.

## Review

Focused review found and closed a P2 test gap for the explicit global bridge. No remaining findings.
