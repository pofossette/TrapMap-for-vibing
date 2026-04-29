# Phase 41: Introduce Graphology and Parsing Libraries to Replace Hand-Rolled Implementations - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the dependency review for broader library adoption

<domain>
## Phase Boundary

Phase 41 should formalize and integrate the new dependency baseline used to replace the project's hand-rolled graph and parsing infrastructure.

This phase is about dependency introduction, local wrappers, and boundary discipline. It is not yet the full graph runtime migration.

In scope:
- Add the selected graph and parsing libraries to the workspace
- Define local wrapper modules so project code depends on internal abstractions
- Standardize utility boundaries for graph operations, parsing, MIME lookup, and ID generation
- Introduce any light dependency needed for safer ID generation

Out of scope:
- Rewriting all graph-assisted runtime code to use the new graph library
- Database/store migration
- Public contract changes
- Full retrieval compiler changes

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- This project has crossed the point where foundational utility code should keep growing by local hand-written helpers.
- The right approach is not “import libraries everywhere”, but “introduce libraries once, then hide them behind local modules”.
- The graph runtime should use the same dependency family already selected in the GraphRAG-lite phases so later work does not reopen library choice.

### Target direction

- Add the selected dependencies at the package boundary that will actually use them, primarily `@trapmap/server`, and expose narrow local helpers.
- Keep the contract and domain layers library-agnostic.
- Add local wrappers for:
  - graph construction and traversal
  - frontmatter parsing
  - MIME detection
  - ID generation

### Dependency decision

- Add `graphology`
- Add `graphology-dag`
- Add `graphology-operators`
- Add `graphology-shortest-path`
- Add `gray-matter`
- Add `mime-types`
- Add `nanoid`
- Do not add `@dagrejs/graphlib`, `graphology-library`, or a full GraphRAG framework

### Dependency posture

- Library introduction should stay incremental and reversible.
- Use wrappers to protect the rest of the codebase from direct dependency churn.
- Favor package-local dependencies over top-level workspace dependencies unless a shared package truly consumes them.

</decisions>

<code_context>
## Existing Code Insights

### Graph work is currently spread across local utilities

- Graph-assisted retrieval currently relies on custom in-memory graph structures in [graph.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/indexing/adapters/graph.ts:61).
- Query-time graph traversal is custom code in [graph-assisted.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/recall/graph-assisted.ts:138).

### Parsing replacements already have clear callsites

- Parsing-related callsites identified for replacement exist in [operations.ts](/home/wunai/project/TrapMap-for-vibing/packages/cli/src/commands/operations.ts:113), [import-export.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/import-export.ts:258), and [derive.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/artifacts/derive.ts:414).

### IDs are still partly ad hoc

- Duplicate case IDs still use `Date.now()` plus `Math.random()` in [detector.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/candidates/detector.ts:222).
- Retrieval query IDs are similarly ad hoc in [rag-log.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/rag-log.ts:76).

</code_context>

<specifics>
## Specific Ideas

- Create a small internal module surface such as:
  - `lib/graph/runtime.ts`
  - `lib/parsing/frontmatter.ts`
  - `lib/files/mime.ts`
  - `lib/ids.ts`
- Migrate new work to these wrappers first, then refactor old callsites in-place.
- Add dependency smoke tests so broken package resolution is caught early.
- Ensure the chosen wrappers keep project semantics explicit rather than leaking generic library types across the codebase.

</specifics>

<deferred>
## Deferred Ideas

- Full graph runtime migration
- Database adapters and ORM integration
- Markdown AST parsing
- Statistical or ML-based reranking dependencies

</deferred>
