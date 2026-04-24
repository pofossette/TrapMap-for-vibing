# Phase 42: Replace Hand-Rolled Graph Operations with Graphology-Based GraphRAG Runtime - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the GraphRAG-lite and dependency decisions

<domain>
## Phase Boundary

Phase 42 should replace the current hand-rolled graph storage and traversal operations with a Graphology-based runtime that can support GraphRAG-lite retrieval and compilation.

This phase is about graph runtime replacement. It is not about database persistence migration or public contract design.

In scope:
- Replace process-local graph helper structures with Graphology-backed graph state
- Migrate graph-assisted traversal, relation expansion, and graph diagnostics onto library operators
- Add graph utilities needed by later GraphRAG-lite phases, such as cycle detection, neighborhood inspection, and path ordering
- Keep current governance filtering behavior intact while changing internal graph mechanics

Out of scope:
- Store migration to PostgreSQL/Drizzle
- Final graph-plan contract work
- LLM-based graph extraction
- Community-detection or full external GraphRAG runtime features

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The current graph code was acceptable for early graph-assisted retrieval but is too narrow for the upcoming GraphRAG-lite compiler.
- Graphology should be used for internal graph mechanics, not exposed as a public API.
- Governance and retrieval scoring remain local product logic even after graph runtime replacement.

### Target direction

- Represent trap/skill graph state through Graphology rather than manual `Map<string, Set<string>>` plus `Map<string, GraphRelation[]>`.
- Move traversal and graph inspection helpers behind internal graph runtime modules.
- Reuse the selected Graphology modules for:
  - graph construction
  - DAG validation
  - topological ordering
  - focused subgraph extraction
  - path and reachability inspection

### Paper-grounded constraints

- The GraSP paper centers on typed DAG compilation and local repair. Even if TrapMap is not implementing the full runtime yet, internal graph mechanics should be strong enough to support acyclic subplans, typed edges, and descendant-aware invalidation.
- Because the paper emphasizes a minimal executable graph rather than a noisy knowledge cloud, the runtime should make it easy to extract small task-relevant subgraphs.

</decisions>

<code_context>
## Existing Code Insights

### Graph state is currently hand-rolled and process-local

- The global graph index is built from plain maps in [graph.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/indexing/adapters/graph.ts:68).
- That design is simple but limited for future DAG-aware GraphRAG-lite behavior.

### Query-time traversal is also custom

- One-hop expansion and relation-strength scoring are currently implemented directly in [graph-assisted.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/recall/graph-assisted.ts:149) and [graph-assisted.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/recall/graph-assisted.ts:212).
- These are exactly the kinds of operations that should stop depending on bespoke in-memory structures.

### Graph extraction stays separate from runtime mechanics

- Extraction logic in [graph-extract.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/graph-extract.ts:21) is still product-specific and should stay local.
- Phase 42 should swap runtime mechanics, not outsource domain semantics.

</code_context>

<specifics>
## Specific Ideas

- Build a graph runtime wrapper that can:
  - add/remove nodes and typed edges
  - derive eligible subgraphs for a query
  - compute local neighborhoods around traps and skills
  - validate acyclic plan candidates
- Keep the current graph-assisted endpoint behavior stable while internal structures change.
- Add regression coverage to ensure:
  - no unauthorized entries appear after graph traversal
  - graph traversal results remain deterministic
  - cycle-like bad inputs are handled explicitly rather than silently producing unstable output

</specifics>

<deferred>
## Deferred Ideas

- Database persistence of Graphology state
- Public graph export endpoints
- Full local repair operators inspired by GraSP
- Community-level graph analytics

</deferred>
