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

