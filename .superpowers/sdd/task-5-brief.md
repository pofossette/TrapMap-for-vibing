### Task 5: Remove Duplicate Host And Legacy Embedding Provider Implementations

**Files:**
- Modify: `packages/host-local/src/nest/config/config.ts`
- Modify: `packages/host-local/src/nest/config/import-boundary.test.ts`
- Delete: `packages/host-local/src/nest/config/ai-provider-config.ts`
- Modify: `packages/server/src/lib/embeddings.ts`
- Modify: `packages/server/src/lib/embeddings.test.ts`
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`

**Interfaces:**
- Consumes: `loadAiProviderConfig`, `createAiProviders`, `FallbackEmbeddings`, and `EmbeddingsProvider` from `@trapmap/ai-providers`.
- Produces: host-local configuration and the legacy `generateEmbedding()` compatibility shim use the one shared provider/config implementation; no local provider-default resolver or fallback embedding implementation remains.

- [ ] **Step 1: Write the failing migration contracts**

```ts
expect(existsSync(resolve(hostLocalRoot, 'src/nest/config/ai-provider-config.ts'))).toBe(false);
expect(configSource).toContain("from '@trapmap/ai-providers'");
expect(embeddingsSource).toContain("from '@trapmap/ai-providers'");
expect(embeddingsSource).not.toContain('class FallbackEmbeddings');
expect(embeddingsSource).not.toContain('class OpenAIEmbeddings');
```

Add a behavior test that resets the legacy embedding adapter, leaves no global
provider installed, and verifies `generateEmbedding('same input')` returns the
same unit-length vector as `new FallbackEmbeddings().embed('same input')`.

- [ ] **Step 2: Run the contracts and behavior test to verify RED**

Run: `rtk pnpm test:file -- packages/host-local/src/nest/config/import-boundary.test.ts`

Expected: FAIL because `ai-provider-config.ts` and local config import remain.

Run: `rtk pnpm test:file -- packages/server/src/lib/embeddings.test.ts`

Expected: FAIL because the legacy shim still owns its own fallback/provider classes.

- [ ] **Step 3: Delegate host config and compatibility embedding selection to the shared package**

```ts
// packages/host-local/src/nest/config/config.ts
import { loadAiProviderConfig } from '@trapmap/ai-providers';

// packages/server/src/lib/embeddings.ts
import {
  createAiProviders,
  loadAiProviderConfig,
  type EmbeddingsProvider,
} from '@trapmap/ai-providers';

async function getEmbeddingsAdapter(): Promise<EmbeddingsProvider> {
  return globalProvider ?? (cachedAdapter ??= createAiProviders(loadAiProviderConfig()).embeddings);
}
```

Delete the host-local duplicate config module. Preserve the existing explicit
global bridge API and its precedence for compatibility consumers; only replace
its local fallback/OpenAI selection implementation with the shared factory.
Split pure provider-config helpers as needed so `loadAiProviderConfig()` and
`FallbackEmbeddings.embed()` no longer introduce Fallow complexity findings.

- [ ] **Step 4: Verify migration and Fallow remediation**

Run: `rtk pnpm test:file -- packages/host-local/src/nest/config/import-boundary.test.ts`

Expected: PASS.

Run: `rtk pnpm test:file -- packages/server/src/lib/embeddings.test.ts`

Expected: PASS.

Run: `rtk pnpm typecheck && rtk pnpm exec fallow audit --base main`

Expected: typecheck passes and the audit reports no introduced dead-code,
complexity, or duplication findings from the shared provider migration.

- [ ] **Step 5: Commit the provider implementation consolidation**

```bash
rtk git add packages/ai-providers packages/host-local/src/nest/config packages/server/src/lib/embeddings.ts packages/server/src/lib/embeddings.test.ts scripts/__tests__/compatibility-retirement-guard.test.ts
rtk git commit -m "refactor: consolidate AI provider implementations"
```

## Self-Review

- Spec coverage: Tasks 1-3 cover the complete provider/config move, structural prompt block, package boundary, server prompt retention, all known consumer categories, and removal of the host-local server provider edge. Task 4 covers the required Docker and eval evidence.
- Scope: graph-query, legacy state, and server package deletion are explicitly excluded and are not represented as completed work.
- Type consistency: every consumer uses the Task 1 names `AiPromptBlock`, `ChatProvider`, `EmbeddingsProvider`, `AiProviders`, `loadAiProviderConfig`, and `createAiProviders`.
- Placeholder scan: no unresolved implementation choices or deferred behavior are present; each task has a red test, a concrete implementation action, a green verification command, and a commit.
