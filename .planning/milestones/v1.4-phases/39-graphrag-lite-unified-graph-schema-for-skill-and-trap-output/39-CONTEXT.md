# Phase 39: GraphRAG-lite Unified Graph Schema for Skill and Trap Outputs - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the GraphRAG-lite discussion for additive public contracts

<domain>
## Phase Boundary

Phase 39 should define the additive public response contracts for GraphRAG-lite so clients can consume trap-first graph plans without breaking existing retrieval APIs.

This phase is about external shape and contract discipline. It is not about indexing internals or ranking heuristics.

In scope:
- Add shared contracts for graph-plan nodes, edges, confidence, citations, and metadata-only activation references
- Keep existing v1 entry retrieval and v2 capsule retrieval intact
- Define an additive response surface for combined skill/trap plan outputs
- Make the new contracts small and specific to TrapMap rather than a generic graph database export

Out of scope:
- Graph extraction internals
- Query-time compiler logic
- Fallback routing policy
- Heavy generic schema design for future unrelated graph features

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The new schema should be additive and should not force existing clients off `/v1/retrieval/search` or `/v2/retrieval/search`.
- The public output should expose trap and skill nodes with typed relations, not an arbitrary bag of internal graph records.
- Activation details must stay metadata-only, consistent with the existing artifact and retrieval design.
- Because these phases were appended sequentially, this phase may act as formalization and hardening of internal GraphRAG-lite shapes that earlier phases prove out first.

### Target direction

- Introduce a compact graph-plan contract with explicit node kinds such as `trap` and `skill`.
- Use a constrained edge vocabulary such as `risk-blocks`, `mitigates`, `requires`, `order`, and `co-occurs-with`.
- Include explicit confidence/fallback metadata so clients can tell when the response is a direct graph plan versus a downgraded path.
- Keep the schema strongly aligned with existing citation, capsule, and activation-hint patterns so downstream code reuse stays high.

### Paper-grounded constraints

- GraSP’s executable graph definition requires acyclicity, reachability, goal completeness, and executability. TrapMap’s public schema should expose enough structure for clients and tests to validate analogous properties, even if the backend is not a full GraSP runtime.
- GraSP node attributes include schema, bound arguments, preconditions, effects, verifier, confidence, and repair budget. TrapMap does not need to expose every internal field, but the public `skill` node shape should preserve the user-relevant subset: prerequisites, expected effects, verifier summary, and confidence.
- GraSP distinguishes edge types by semantics rather than treating all dependencies as a flat list. The TrapMap graph-plan contract should do the same so downstream clients can render or act on blockers differently from order-only hints.
- The paper’s central lesson is that orchestration quality matters more than quantity. The public schema should therefore optimize for a minimal actionable plan, not for exporting the full internal graph.

### Library posture

- No dedicated schema library is needed beyond the existing `zod` contract layer.
- Keep the public contract hand-authored in local TypeScript/Zod so it remains aligned with the rest of the monorepo.
- Avoid bringing in generic graph-serialization packages unless a concrete interoperability requirement appears later.
- Treat the graph runtime dependency decision as already fixed upstream:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Do not expose the chosen graph library directly through contracts; keep contracts library-agnostic.

</decisions>

<code_context>
## Existing Code Insights

### Retrieval contracts already support additive evolution

- Current retrieval modes and response families are defined in [retrieval.ts](/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/retrieval.ts:9).
- The codebase already supports multiple retrieval response shapes without breaking compatibility, which makes an additive graph-plan contract a natural next step.

### Skill-side metadata is already constrained correctly

- Skill artifact contracts already distinguish derived text from activation metadata in [artifacts.ts](/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/artifacts.ts:105).
- That separation should carry directly into the graph-plan contracts so script and asset bodies stay out of retrieval responses.

### Candidate and source-type vocabulary already exists

- The project already models distinct `trap` and `skill` source types in [candidates.ts](/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/candidates.ts:25).
- Phase 39 can reuse that vocabulary to keep the new graph-plan shape aligned with the rest of the domain model.

</code_context>

<specifics>
## Specific Ideas

- Add public contract primitives for:
  - graph-plan node
  - graph-plan edge
  - graph-plan confidence
  - graph-plan response
- Let trap nodes carry blocker/guard context and let skill nodes carry precondition/effect/verifier summaries.
- Reuse existing citation and activation-hint concepts rather than duplicating them with new names.
- Prefer a new additive endpoint or route family over overloading the existing v1/v2 contracts.

</specifics>

<deferred>
## Deferred Ideas

- Generic subgraph export APIs
- Community or cluster schema for global graph reports
- Full graph mutation contracts
- Non-retrieval graph inspection tooling

</deferred>
