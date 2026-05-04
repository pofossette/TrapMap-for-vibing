# Phase 80: Operations Route Refactoring - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase, discuss skipped)

<domain>
## Phase Boundary

拆分 `packages/server/src/routes/operations.ts` (1680 行) 为多个职责单一的路由模块，提升可维护性。

</domain>

<decisions>
## Implementation Decisions

### Target Structure
- Create `operations/` subdirectory under `routes/` for split modules
- Main `operations.ts` becomes a thin router that only registers sub-routes (~50 lines)
- Sub-modules: artifacts-import.ts, artifacts-export.ts, artifacts-activate.ts, skill-edit.ts, skill-review.ts, knowledge-legacy.ts, audit.ts, migrate.ts, status.ts

### Compatibility
- API paths MUST remain unchanged (backward compatible)
- No functional changes — pure structural refactoring
- Test files must be synchronized with module splits

### Module Size Constraints
- Main `operations.ts` < 100 lines
- Each sub-module < 400 lines

### Claude's Discretion
- Exact groupings and internal organization within each module
- Whether to keep a barrel export or register routes directly
- How to handle shared middleware/utilities between modules

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing route files: auth.ts, feedback.ts, knowledge.ts, etc. — establish pattern for route module structure
- `operations.test.ts` — existing tests to preserve
- `packages/server/src/app.ts` — route registration

### Established Patterns
- Express.js route registration pattern
- Router() usage with middleware
- Each route file exports a router function

### Integration Points
- `packages/server/src/app.ts` — route registration point
- `packages/server/src/routes/operations.ts` — source file to split
- `packages/server/src/routes/operations.test.ts` — test file to split

</code_context>

<specifics>
## Specific Ideas

From SPEC.md:
- Split into: audit-routes, activation-routes, import-export-routes, skill-edit-routes at minimum
- OR use operations/ subdirectory with: artifacts-import, artifacts-export, artifacts-activate, skill-edit, skill-review, knowledge-legacy, audit, migrate, status
- Update app.ts to register new routes
- Migrate related test files
- Clean up or delete original operations.ts

</specifics>

<deferred>
## Deferred Ideas

- CLI side `packages/cli/src/commands/operations.ts` refactoring (Phase 85)
- API interface changes (out of scope)

</deferred>
