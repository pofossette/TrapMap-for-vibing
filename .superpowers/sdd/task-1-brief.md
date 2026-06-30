# Task 1: Foundation Tools — dependency-cruiser + TypeDoc + mustMatchRegex

## Task Description

Install and configure three foundational tools that other tasks depend on.

### 1A: dependency-cruiser

Install `dependency-cruiser` and create `.dependency-cruiser.cjs` at the repo root with the following rules:

**Forbidden rules** (enforce package layer boundaries):
1. `contracts-is-foundation`: `packages/contracts` must NOT depend on any workspace package
2. `backend-core-only-depends-contracts`: `packages/backend-core` must only depend on `packages/contracts` (NOT server, host-*, service-*, web-panel, cli)
3. `server-no-host-deps`: `packages/server` must NOT depend on `packages/host-*`
4. `services-must-not-cross-dep`: `packages/service-*` must NOT depend on each other
5. `web-panel-server-isolation`: `packages/web-panel` must NOT import from `packages/server`, `packages/backend-core`, or `packages/host-*`

**Options**:
- `tsPreCompilationDeps: true`
- `tsConfig: { fileName: 'tsconfig.base.json' }`
- `enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'default'] }`

Add script to `package.json`: `"check:deps": "depcruise --config .dependency-cruiser.cjs packages/*/src"`

### 1B: TypeDoc

Install `typedoc` and create `typedoc.json` at the repo root:

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPointStrategy": "packages",
  "entryPoints": ["packages/contracts", "packages/backend-core"],
  "out": "docs/api",
  "excludePrivate": true,
  "excludeInternal": true,
  "categorizeByGroup": true
}
```

Add script to `package.json`: `"docs:api": "typedoc"`

### 1C: mustMatchRegex in check-doc-drift.ts

Add `mustMatchRegex` field to the `DocRule` interface in `scripts/check-doc-drift.ts`:

```typescript
mustMatchRegex?: string[];  // Content must match at least one of these regex patterns
```

Add implementation in `checkRule()`:
```typescript
if (rule.mustMatchRegex) {
  for (const patternStr of rule.mustMatchRegex) {
    try {
      const re = new RegExp(patternStr, 's');
      if (!re.test(content)) {
        msgs.push(`[doc-drift] FAIL: ${rule.file} must match regex /${patternStr}/ but no match found`);
      }
    } catch (err) {
      msgs.push(`[doc-drift] ERROR: invalid regex "${patternStr}" in mustMatchRegex for ${rule.file}: ${err}`);
    }
  }
}
```

Add unit tests to `scripts/__tests__/check-doc-drift.test.ts`:
- Passes when regex matches content
- Fails when regex does not match
- Reports invalid regex as an error
- Supports multiline matching with 's' flag
- Returns empty array when mustMatchRegex is empty

## Context

This project is a TypeScript pnpm monorepo with 15 packages. The architecture is layered:
- `contracts`: foundation, shared types (no workspace deps)
- `backend-core`: host-agnostic kernel, ports + use-cases (only depends on contracts)
- `server`: infrastructure implementation (Fastify, pg, drizzle)
- `host-local`, `host-distributed`: host assemblies
- `service-*`: distributed service modules
- `web-panel`, `cli`: client-side packages

The tsconfig.base.json has `composite: true`, `declaration: true`, `declarationMap: true` and path aliases for all `@trapmap/*` packages.

Existing tools: biome, knip, fallow, vitest. No dependency-cruiser, TypeDoc, or markdownlint currently installed.

## Key Files

- `scripts/check-doc-drift.ts` — doc rules engine
- `scripts/__tests__/check-doc-drift.test.ts` — unit tests
- `package.json` — scripts and devDependencies
- `tsconfig.base.json` — TypeScript config
- `pnpm-workspace.yaml` — workspace config

## Your Job

1. Install `dependency-cruiser` and `typedoc` as root devDependencies
2. Create `.dependency-cruiser.cjs` with the forbidden rules described above
3. Create `typedoc.json` with the config described above
4. Add `mustMatchRegex` to DocRule interface and checkRule() in check-doc-drift.ts
5. Add unit tests for mustMatchRegex in check-doc-drift.test.ts
6. Add the 3 new scripts to package.json (`check:deps`, `docs:api`)
7. Run `pnpm check:deps` to verify dependency-cruiser works (should pass on current codebase)
8. Run `pnpm exec vitest run scripts/__tests__/check-doc-drift.test.ts` to verify unit tests pass
9. Commit your work
