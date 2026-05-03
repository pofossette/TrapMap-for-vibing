# Phase 74: Dead Code Removal - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Code cleanup using knip analysis

<domain>
## Phase Boundary

Phase 74 should remove unused functions, imports, and files across the codebase.

In scope:
- Remove unused files identified by knip
- Remove unused exports (functions, classes, types)
- Clean up unused imports
- Verify all tests still pass after cleanup

Out of scope:
- Refactoring code structure
- Adding new features
- Performance optimization
</domain>

<decisions>
## Implementation Decisions

### Approach

1. Start with unused files (safest to remove)
2. Remove unused exports that are clearly internal
3. Keep exports that might be part of a public API or used in tests
4. Run tests after each change

### Knip findings (2026-05-04)

**Unused files (6):**
- `packages/server/src/lib/config/feature-flags.ts`
- `packages/server/src/lib/feedback/batch.ts`
- `packages/server/src/lib/feedback/quality-score.ts`
- `packages/server/src/lib/lifecycle/index.ts`
- `packages/server/src/lib/retrieval/recall/hybrid-recall.ts`
- `packages/server/src/lib/retrieval/recall/pg-vector.ts`

**Unused exports (64):**
- Various functions and classes not imported anywhere

**Unused exported types (88):**
- Type definitions not used in production or test code
</decisions>

<code_context>
## Existing Code Insights

### Safe to remove
- Unused files with no imports
- Unused internal functions
- Unused type definitions

### Need verification
- Exports from index files (might be public API)
- Types used in JSDoc comments
- Classes that might be instantiated dynamically
</code_context>

<specifics>
## Specific Actions

1. Run `pnpm knip` to identify unused code
2. Delete unused files
3. Remove unused exports from source files
4. Run `pnpm test` to verify no regressions
5. Run `pnpm typecheck` to verify no type errors
</specifics>

<deferred>
## Deferred Ideas

- Automated dead code detection in CI
- Stricter TypeScript settings to catch unused code
- Documentation of public API surface
</deferred>
