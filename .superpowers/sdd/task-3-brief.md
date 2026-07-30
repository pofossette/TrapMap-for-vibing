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

