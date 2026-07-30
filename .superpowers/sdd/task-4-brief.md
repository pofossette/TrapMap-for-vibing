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
