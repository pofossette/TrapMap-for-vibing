# Phase 36: GraphRAG-lite Indexing Pipeline for Skill-Trap Graph Extraction - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the GraphRAG-lite discussion for unified skill/trap retrieval

<domain>
## Phase Boundary

Phase 36 should add the indexing foundation for GraphRAG-lite by turning both trap knowledge and skill artifacts into queryable graph/index inputs.

This phase is about extraction, persistence, and lifecycle-driven indexing. It is not about the final user-facing graph-plan response.

In scope:
- Add graph/indexing support for both `knowledgeEntries` and `skillArtifacts`
- Extract graph-ready nodes and relations from trap text plus derived skill capsule/profile text
- Persist graph state in a durable store-backed shape instead of process-local memory only
- Trigger index refresh on approval, update, and deactivation for both domains
- Keep governance inheritance intact so indexed skill capsules still respect artifact-root scope and required level

Out of scope:
- Public GraphRAG response contracts
- Trap-first plan compilation and ranking
- Confidence-based routing and fallback behavior
- Community detection, global report generation, or other heavy GraphRAG features

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- This project should borrow GraphRAG indexing ideas without importing an external GraphRAG runtime.
- The GraSP paper argues that the bottleneck has shifted from skill availability to skill orchestration, so indexing should optimize for later compilation quality rather than maximizing raw graph volume.
- Approved, retrievable content is the only content that should enter the graph index.
- Assets and script bodies should remain activation-only and must not be indexed as graph content.
- The graph extractor should move away from generic entity extraction toward TrapMap-specific semantics such as trap triggers, mitigations, prerequisites, and tool/path/environment cues.

### Target direction

- Keep the existing adapter-based indexing shape and extend it to cover skill artifacts rather than replacing it.
- Treat derived skill capsules as the primary skill-side indexing unit because they already provide distilled `situation`, `problem`, and `goal` text.
- Persist enough graph state to support deterministic query-time expansion without rebuilding the graph from scratch on every request.
- Favor a small typed relation set that the later compiler can trust: `mitigates`, `requires`, `order`, `risk-blocks`, and `co-occurs-with`.
- GraSP uses `state`, `data`, and `order` edges in its executable DAG. TrapMap does not need to mirror that schema literally, but the indexing layer should preserve enough evidence to map later into hard dependency edges versus softer precedence edges.

### Paper-grounded constraints

- GraSP explicitly inserts a compilation layer between retrieval and execution; Phase 36 should therefore index for compilation, not just for recall ranking.
- GraSP emphasizes that compilation prunes redundant skills into a minimal plan. This means the index should favor precise relation evidence over broad fuzzy linkage.
- GraSP treats state/data dependencies as harder constraints than order edges. TrapMap should preserve that distinction in extracted relation metadata so later phases can keep hard edges harder to rewrite.

### Library posture

- For this phase, introducing a focused graph utility library is warranted because Phase 36 is foundational infrastructure, not product-specific ranking logic.
- Do not introduce a full external GraphRAG runtime such as Microsoft GraphRAG or LightRAG into the server path.
- Exact dependency decision for the GraphRAG-lite graph layer:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Rationale for choosing `graphology` over `@dagrejs/graphlib`:
  - official docs expose a broader maintained graph standard library including DAG helpers, operators, components, metrics, shortest-path, and traversal extensions
  - it fits the likely next-step needs beyond simple topsort, such as subgraph extraction, locality-bounded repair, and richer diagnostics
  - `graphlib` is viable for lighter DAG work, but its package surface is narrower and its npm/package metadata indicates a much slower release cadence
- Keep extraction, governance, retrieval orchestration, and public contracts in local TypeScript.
- Continue using PostgreSQL plus `pgvector` for durable vector storage when the project moves off the JSON store.
- Do not install `graphology-library`; use the small explicit modules above to keep the dependency surface bounded.

</decisions>

<code_context>
## Existing Code Insights

### Current knowledge indexing already has the right skeleton

- The current lifecycle-driven indexing pipeline for traps/knowledge lives in [pipeline.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/indexing/pipeline.ts:122).
- That pipeline already fans out to `vector`, `keyword`, and `graph` adapters, which makes it the right extension point rather than creating a second indexing subsystem.

### Current graph storage is too lightweight for the new use case

- The graph adapter still stores state in process-local maps in [graph.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/indexing/adapters/graph.ts:61).
- That is acceptable for the earlier graph-assisted recall work but too weak for a unified skill/trap graph that later phases will depend on.

### Skill-side derived text already exists

- Skill artifacts already derive profile, capsules, and client manifest outputs in [derive.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/artifacts/derive.ts:550).
- Those derived capsule/profile records are the natural source for skill-side graph extraction because they are already text-distilled and governance-aware.

### Current extractor is generic, not TrapMap-specific

- The current extractor in [graph-extract.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/graph-extract.ts:21) is built around generic `service/tool/symptom/fix/environment` entities.
- GraphRAG-lite needs a stronger domain model centered on traps, skills, mitigations, blockers, and execution ordering.

</code_context>

<specifics>
## Specific Ideas

- Add a store-backed graph document shape for:
  - trap source records derived from `shortcut`, `detail`, and labels
  - skill source records derived from capsule/profile text
  - relation records between those two domains
- Extend indexing hooks so approved skill artifacts refresh graph state the same way approved knowledge entries refresh vector and keyword state.
- Keep extraction deterministic and rule-based first; do not make indexing depend on an LLM.
- Preserve references to source IDs and revisions so later phases can build citations and activation hints without guessing lineage.
- Encode enough metadata per edge to support later classification into:
  - hard dependency-like edges
  - soft precedence edges
  - trap-to-skill mitigation links
- Treat “less is more” as an indexing constraint: do not flood the graph with low-value generic entities that later phases cannot use to narrow the plan.

</specifics>

<deferred>
## Deferred Ideas

- Public graph-plan contracts
- Trap-first response compilation
- Confidence scoring and fallback routing
- Heavy graph analytics such as clustering or community summaries

</deferred>
