# Shared AI Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the complete AI provider configuration and implementation from the compatibility server into `@trapmap/ai-providers`, removing host-local's AI-provider dependency on `@trapmap/server` while retaining server-owned prompt helpers.

**Architecture:** A new dependency-leaf workspace package owns provider contracts, environment configuration, provider selection, and provider implementations. Server prompt/cache/parse code stays in `packages/server/src/lib/ai`; every provider/config consumer imports the new package directly. The existing compatibility retirement guard becomes the deletion contract for the host-local server edge.

**Tech Stack:** TypeScript 5.9 project references, pnpm workspace, Vitest 3, `@langchain/core`, `@langchain/openai`, native `fetch`, Docker-coordinated PostgreSQL acceptance scripts.

## Global Constraints

- The package name is exactly `@trapmap/ai-providers` and it must not import `@trapmap/server`, a host package, a service package, prompt templates, or server prompt/cache modules.
- Move complete provider configuration and implementation: `AiProviderType`, `AiProviderConfig`, provider defaults/environment loading, provider contracts, fallback/OpenAI-compatible/Google GenAI implementations, and `createAiProviders()`.
- Keep prompt templates, template selection, cache, parsing, and dynamic prompt injection under `packages/server/src/lib/ai`.
- Preserve provider selection, environment precedence, fallback behavior, lazy LangChain initialization, 30-second timeout, Google GenAI validation, and provider errors exactly.
- `AiPromptBlock` contains only `content: string`; server `PromptBlock` remains structurally assignable without a server dependency from the new package.
- Use `rtk` for every repository command, apply TDD before production code, and commit each coherent batch.
- Do not mark Wave-8, Wave-9, or Wave-10 complete in this work.

---

## File Structure

- `packages/ai-providers/package.json`: publishes the shared workspace package and declares LangChain dependencies.
- `packages/ai-providers/tsconfig.json`: builds the package from `src` with no project references.
- `packages/ai-providers/src/types.ts`: provider-facing contracts and structural prompt-block type.
- `packages/ai-providers/src/provider-config.ts`: environment-to-provider configuration resolution.
- `packages/ai-providers/src/providers.ts`: provider implementations and factory.
- `packages/ai-providers/src/index.ts`: public provider/config export surface.
- `packages/ai-providers/src/providers.test.ts`: factory, fallback, lazy-provider and Google GenAI behavior tests.
- `packages/ai-providers/src/provider-config.test.ts`: environment precedence and fallback tests.
- `packages/ai-providers/src/import-boundary.test.ts`: proves the package is independent of compatibility and prompt code.
- `packages/server/src/lib/ai/{index,types,provider-config,providers}.ts`: retain only server-owned prompt facilities; provider files are deleted after consumers move.
- `packages/server/src/{app,config}.ts`, server AI type consumers, evals, and `scripts/label-runner.ts`: consume `@trapmap/ai-providers` directly.
- `packages/host-local/src/nest/runtime/shared-infra.ts`: constructs AI from the new package, leaving graph-query as the only remaining server edge.
- `packages/{server,host-local}/package.json`, root `tsconfig.json`, `vitest.config.ts`, and `pnpm-lock.yaml`: establish workspace build/test resolution and dependencies.
- `scripts/__tests__/compatibility-retirement-guard.test.ts`: reject provider/config server imports while retaining the separate graph-query Wave-8 exception.
- `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`, `docs/README.md`, and `docs/PACKAGES.md`: record the package and Wave-8 evidence after behavior is verified.

### Task 1: Create the Independent Provider Package

**Files:**
- Create: `packages/ai-providers/package.json`
- Create: `packages/ai-providers/tsconfig.json`
- Create: `packages/ai-providers/src/{index,types,provider-config,providers}.ts`
- Create: `packages/ai-providers/src/{providers,provider-config,import-boundary}.test.ts`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `AiPromptBlock { content: string }`, `EmbeddingsProvider`, `ChatProvider`, `AiProviders`, `AiProviderType`, `AiProviderConfig`, `loadAiProviderConfig()`, and `createAiProviders(config)` from `@trapmap/ai-providers`.
- Consumes: only LangChain packages, `fetch`, and `process.env`.

- [ ] **Step 1: Write the failing package-boundary and config tests**

```ts
it('has no compatibility or prompt-package imports', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'index.ts'), 'utf8');
  expect(source).not.toContain('@trapmap/server');
  expect(source).not.toContain('/prompts');
  expect(source).not.toContain('/cache');
});

it('keeps a server-shaped prompt block assignable to ChatProvider', () => {
  const block: AiPromptBlock = { content: 'system instruction' };
  expect(block.content).toBe('system instruction');
});
```

Copy the existing provider/config behavior assertions into the new package test
files, including fallback, OpenAI key precedence, Google key precedence,
embedding override, deterministic fallback vectors, missing Google configuration,
and `invokeWithBlocks([{ content: 'block' }], 'user')`.

- [ ] **Step 2: Run the new tests to verify the missing package fails**

Run: `rtk pnpm exec vitest run --project ai-providers packages/ai-providers/src/providers.test.ts packages/ai-providers/src/provider-config.test.ts packages/ai-providers/src/import-boundary.test.ts`

Expected: FAIL because the `ai-providers` project and source package do not yet exist.

- [ ] **Step 3: Add the minimal package and move provider code without prompt imports**

```ts
// packages/ai-providers/src/types.ts
export interface AiPromptBlock { content: string }
export interface EmbeddingsProvider { readonly provider: string; readonly isConfigured: boolean; embed(text: string): Promise<number[]> }
export interface ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
  invokeWithBlocks?(blocks: AiPromptBlock[], userMessage: string): Promise<string>;
}
export interface AiProviders { embeddings: EmbeddingsProvider; chat: ChatProvider }
```

Move the provider config and provider classes verbatim except replace
`import('./cache/api-integration.js').PromptBlock[]` with `AiPromptBlock[]`.
Create the package manifest with `@langchain/core` and `@langchain/openai` as
dependencies, register an `ai-providers` Vitest project, add the root TypeScript
reference, then update the lockfile with `rtk pnpm install --lockfile-only`.

- [ ] **Step 4: Run package behavior and build checks**

Run: `rtk pnpm --filter @trapmap/ai-providers test`

Expected: PASS with all provider, config, and boundary tests.

Run: `rtk pnpm --filter @trapmap/ai-providers typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the package foundation**

```bash
rtk git add packages/ai-providers tsconfig.json vitest.config.ts pnpm-lock.yaml
rtk git commit -m "feat: add shared AI providers package"
```

### Task 2: Migrate Provider And Configuration Consumers

**Files:**
- Modify: `packages/host-local/src/nest/runtime/shared-infra.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/lib/context.ts`
- Modify: `packages/server/src/lib/embeddings.ts`
- Modify: `packages/server/src/lib/indexing/{pipeline,events,skill-events,artifact-pipeline,skill-graph-build}.ts`
- Modify: `packages/server/src/lib/indexing/{adapters/graph,adapters/artifact-graph,graph-lite/llm-extract,graph-lite/llm-extract-planning}.ts`
- Modify: `packages/server/src/lib/{pre-review,boundary-extract}.ts`
- Modify: `packages/server/src/lib/artifacts/{contextual-enrichment,derive/types}.ts`
- Modify: `packages/server/src/lib/labels/{graph-align,llm-align,backfill,candidate-recall}.ts`
- Modify: matching server test type imports under `packages/server/src/lib/**`
- Modify: `scripts/label-runner.ts`
- Modify: `evals/label-alignment/lib/{decision-eval,decision-eval.test}.ts`
- Modify: `evals/graph-extraction/{run,dedup-eval,conflict-eval}.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/host-local/package.json`
- Modify: root `package.json` only if root-run scripts need an explicit workspace dependency

**Interfaces:**
- Consumes: Task 1 exports from `@trapmap/ai-providers`.
- Produces: no production provider/config import from `@trapmap/server/lib/ai/{index,types,providers,provider-config}.js` outside server-owned prompt/cache/parse modules.

- [ ] **Step 1: Add an import migration test that fails against current consumers**

Extend `packages/host-local/src/nest/runtime/import-boundary.test.ts` with:

```ts
expect(sharedInfraSource).not.toContain('@trapmap/server/lib/ai');
expect(sharedInfraSource).toContain("from '@trapmap/ai-providers'");
```

Extend `scripts/__tests__/compatibility-retirement-guard.test.ts` to scan the
listed provider/config consumer files and reject
`@trapmap/server/lib/ai/(index|types|providers|provider-config)` while allowing
server-local `prompts`, `parse`, `cache`, `dynamic`, and `providers/` template
helpers.

- [ ] **Step 2: Run the boundary test and verify the expected failure**

Run: `rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts`

Expected: FAIL because `shared-infra.ts` imports `createAiProviders` and
`AiProviders` from `@trapmap/server/lib/ai/index.js`.

- [ ] **Step 3: Change every provider/config consumer to the shared package**

Use direct imports, preserving prompt imports in server code:

```ts
import {
  createAiProviders,
  loadAiProviderConfig,
  type AiProviders,
  type ChatProvider,
  type EmbeddingsProvider,
} from '@trapmap/ai-providers';
```

Keep imports such as `./ai/prompts.js`, `./ai/parse.js`, and
`./ai/cache/api-integration.js` unchanged. Add `@trapmap/ai-providers` as a
workspace dependency to server and host-local. For root-level scripts/evals,
use the package through workspace resolution rather than a relative server
source import.

- [ ] **Step 4: Run focused consumer tests and typecheck**

Run: `rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts packages/host-local/src/nest/runtime/host-services.test.ts`

Expected: PASS.

Run: `rtk pnpm --filter @trapmap/server test --run src/lib/indexing/graph-lite/llm-extract.test.ts src/lib/boundary-extract.test.ts src/lib/labels/llm-align.test.ts`

Expected: PASS.

Run: `rtk pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit consumer migration**

```bash
rtk git add packages/host-local packages/server scripts/label-runner.ts evals package.json pnpm-lock.yaml
rtk git commit -m "refactor: consume shared AI providers"
```

### Task 3: Remove Compatibility Provider Modules And Close The Provider Edge

**Files:**
- Modify: `packages/server/src/lib/ai/index.ts`
- Delete: `packages/server/src/lib/ai/{types,provider-config,providers,providers.test,provider-config.test}.ts`
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`
- Modify: `docs/README.md`
- Modify: `docs/PACKAGES.md`

**Interfaces:**
- Consumes: Task 1 public API and Task 2 consumer imports.
- Produces: a server AI directory containing only server-owned prompt/cache/parse/dynamic/template code; no provider compatibility entry point.

- [ ] **Step 1: Add deletion assertions before removing old modules**

```ts
for (const retiredPath of [
  'packages/server/src/lib/ai/types.ts',
  'packages/server/src/lib/ai/provider-config.ts',
  'packages/server/src/lib/ai/providers.ts',
]) {
expect(existsSync(resolve(repoRoot, retiredPath))).toBe(false);
}

const hostSharedInfra = readFileSync(
  resolve(repoRoot, 'packages/host-local/src/nest/runtime/shared-infra.ts'),
  'utf8',
);
expect(hostSharedInfra).not.toContain('@trapmap/server/lib/ai');
```

- [ ] **Step 2: Run the retirement guard to prove the deletion contract is red**

Run: `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`

Expected: FAIL because the compatibility provider files and provider import
still exist.

- [ ] **Step 3: Remove only provider compatibility modules and exports**

Delete the three implementation/config/type files and their moved tests. Remove
their re-exports from `packages/server/src/lib/ai/index.ts`, but preserve the
server-owned prompt/cache/parse/dynamic/template exports. Remove the host-local
Wave-8 allowlist only when the graph-query migration removes the final server
symbol from `shared-infra.ts`; this task keeps that entry because graph-query
is not in scope.

Document the new package in package navigation and record the exact focused
test evidence in the active compatibility-retirement detail. State explicitly
that graph-query remains the unresolved Wave-8 edge.

- [ ] **Step 4: Run retirement and documentation checks**

Run: `rtk pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`

Expected: PASS.

Run: `rtk pnpm check:docs-drift && rtk pnpm check:structure && rtk git diff --check`

Expected: PASS.

- [ ] **Step 5: Commit the compatibility cleanup**

```bash
rtk git add packages/server/src/lib/ai scripts/__tests__/compatibility-retirement-guard.test.ts docs
rtk git commit -m "refactor: retire server AI providers"
```

### Task 4: Execute Docker-Coordinated Acceptance

**Files:**
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`

**Interfaces:**
- Consumes: Tasks 1-3 migrated provider/config seam.
- Produces: acceptance evidence for this bounded Wave-8 import retirement.

- [ ] **Step 1: Run the shared package and composition verification set**

Run: `rtk pnpm --filter @trapmap/ai-providers test && rtk pnpm exec vitest run --project host-local packages/host-local/src/nest/runtime/import-boundary.test.ts packages/host-local/src/nest/runtime/host-services.test.ts && rtk pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run Docker-coordinated behavior acceptance**

Run: `rtk pnpm test:deployment-smoke && rtk pnpm test:runtime-foundations && rtk pnpm eval:smoke`

Expected: all commands PASS under the PostgreSQL coordinator; record actual
test counts and any non-blocking inherited output exactly.

- [ ] **Step 3: Run the architecture boundary audit**

Run: `rtk pnpm exec fallow audit --base main --format json --quiet`

Expected: `verdict: pass` and no introduced dependency-boundary violation.

- [ ] **Step 4: Record evidence without closing the wave**

Append an active-plan entry that names `@trapmap/ai-providers`, confirms the
host-local provider/config edge is gone, lists the passing commands, and states
that server graph-query ownership remains before Wave-8 can close.

- [ ] **Step 5: Commit acceptance evidence**

```bash
rtk git add docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md
rtk git commit -m "docs: record shared AI provider acceptance"
```

## Self-Review

- Spec coverage: Tasks 1-3 cover the complete provider/config move, structural prompt block, package boundary, server prompt retention, all known consumer categories, and removal of the host-local server provider edge. Task 4 covers the required Docker and eval evidence.
- Scope: graph-query, legacy state, and server package deletion are explicitly excluded and are not represented as completed work.
- Type consistency: every consumer uses the Task 1 names `AiPromptBlock`, `ChatProvider`, `EmbeddingsProvider`, `AiProviders`, `loadAiProviderConfig`, and `createAiProviders`.
- Placeholder scan: no unresolved implementation choices or deferred behavior are present; each task has a red test, a concrete implementation action, a green verification command, and a commit.
