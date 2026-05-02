# Phase 53: Boundary Indexing and Graph Integration - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap and the applicability-boundary analysis

<domain>
## Phase Boundary

Phase 53 should turn approved applicability boundaries into indexed facets and graph-linked records that can be queried efficiently and explained consistently.

This phase is about normalized storage, indexing, and relationship modeling. It is not about submission UX or final retrieval policy.

In scope:
- Materialize approved boundary fields into searchable/indexable form
- Add normalized boundary facets for filtering and diagnostics
- Add graph nodes and edges for standardized boundary values such as environments, versions, and prerequisites
- Support reverse lookup from boundary value to affected entries or artifacts
- Keep boundary indexing aligned with governance and lifecycle rules

Out of scope:
- Interactive review capture
- Retrieval ranking/penalty policy
- Conflict detection logic
- Broad ontology management beyond the initial normalized vocabulary

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- Only reviewer-approved boundaries should become retrieval-facing index material by default.
- Boundary indexing must not weaken governance. A user cannot discover forbidden entries through reverse boundary lookups.
- Facets and graph nodes serve different purposes:
  - facets for direct filtering and fast diagnostics
  - graph nodes for relation traversal, grouping, and future conflict analysis
- Normalization needs to happen before indexing so variants like `prod` and `production` do not fragment the graph.

### Target direction

- Add an indexable boundary projection rather than repeatedly parsing raw boundary JSON during retrieval.
- Reuse the graphology-backed graph document patterns introduced in v1.4 instead of adding an unrelated graph subsystem.
- Keep the boundary graph vocabulary constrained, typed, and reviewable.
- Preserve enough provenance to distinguish inferred-but-approved values from directly asserted values.

</decisions>

<code_context>
## Existing Code Insights

### GraphRAG-lite already has the right storage direction

- v1.4 introduced durable graph documents and reconciliation flows for trap and skill sources in [graph-extract.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/graph-extract.ts), [documents.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/indexing/graph-lite/documents.ts), and [reconcile.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/indexing/reconcile.ts).
- Phase 53 should extend that graph/document strategy, not create a second boundary-only index model.

### Existing graph extraction already recognizes boundary-adjacent entities

- Environment nodes, version cues, prerequisites, and mitigations are already extracted from normalized text in [graph-extract.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/graph-extract.ts:344).
- Phase 53 should replace some of that heuristic-only signal with direct structured boundary projections where available.

### Indexing lifecycle already reacts to approval, update, and deactivation

- Current indexing pipelines already synchronize approved vs non-approved state and remove stale or deactivated sources from indexes in [pipeline.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/indexing/pipeline.ts:115) and [reconcile.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/indexing/reconcile.ts:197).
- Boundary projections should hook into the same lifecycle triggers.

### Retrieval filters currently do not expose boundary facets

- Public retrieval filters are limited to team, labels, and scopes in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:13).
- Phase 53 should prepare the underlying projection that later allows Phase 54 to expose richer filters safely.

</code_context>

<specifics>
## Specific Ideas

- Build a normalized boundary projection per published source containing:
  - canonical stack values
  - canonical environment values
  - stage values
  - version subjects/ranges
  - prerequisite descriptors
  - exclusion descriptors
- Add graph edges such as:
  - `applies-in-environment`
  - `targets-stack`
  - `requires-prerequisite`
  - `excludes-context`
- Store enough metadata to answer:
  - which entries mention this boundary
  - which entries require it
  - which entries exclude it

</specifics>

<deferred>
## Deferred Ideas

- External ontology service for synonym normalization
- Cross-project global boundary analytics
- Fully generic graph query APIs
- Learned embeddings over boundary graphs

</deferred>
