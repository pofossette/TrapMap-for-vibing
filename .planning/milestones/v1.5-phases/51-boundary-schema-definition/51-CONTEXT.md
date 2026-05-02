# Phase 51: Boundary Schema Definition - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap and the applicability-boundary analysis

<domain>
## Phase Boundary

Phase 51 should define the canonical applicability-boundary schema shared by trap knowledge entries and skill artifacts.

This phase is about contract design, normalization vocabulary, and reviewable semantics. It is not about CLI capture UX, graph indexing, or retrieval scoring.

In scope:
- Define a single schema that covers all six boundary layers:
  - context
  - versions
  - prerequisites
  - signals
  - exclusions
  - evidence
- Define rule semantics such as `required`, `preferred`, and `excluded` so later retrieval code can make deterministic decisions
- Define normalized value shapes for stack, environment, lifecycle stage, topology, and version constraints
- Keep the schema usable for both legacy trap/knowledge records and skill-derived capsule/artifact surfaces
- Define what is author-supplied, agent-inferred, and reviewer-verified

Out of scope:
- Submission CLI flags and payload wiring
- Pre-review extraction prompts or heuristics
- Search facet indexing or graph node materialization
- Retrieval-time boosts, penalties, or explanation output

</domain>

<decisions>
## Implementation Decisions

### Why no extra phase is needed

- The roadmap already splits the applicability-boundary work into a coherent chain:
  - Phase 51: schema
  - Phase 52: capture
  - Phase 53: indexing
  - Phase 54: retrieval
- The earlier applicability analysis maps cleanly onto those four phases, so adding a Phase 58 just to hold the concept would duplicate responsibility instead of reducing ambiguity.

### Working assumptions

- Applicability is not equivalent to labels. Labels help recall; boundaries decide whether a result is actually valid in the caller's context.
- The boundary model must support both positive constraints and negative constraints. A system that only stores "applies to X" but cannot store "do not use for Y" is incomplete.
- The schema should distinguish certainty and provenance:
  - author asserted
  - agent inferred
  - reviewer verified
- The schema must stay additive to the current knowledge and artifact contracts so v1.4 retrieval and governance flows do not break.

### Target direction

- Introduce a reusable `applicabilityBoundarySchema` in the contracts package.
- Use explicit rule objects rather than plain string arrays where semantics matter.
- Treat version constraints as structured data, not only prose embedded inside `detail` or `content`.
- Make exclusions first-class so later phases can filter or penalize results deterministically.

</decisions>

<code_context>
## Existing Code Insights

### Existing capsule structure already exposes partial applicability signals

- Skill capsules already model `situation`, `problem`, `goal`, optional `errorText`, and labels in [artifacts.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/artifacts.ts:145).
- That means Phase 51 is not inventing context structure from scratch. It is formalizing and generalizing signals that already exist on the skill side.

### Retrieval intent parsing already extracts context hints

- Seed parsing already produces `situation`, `problem`, `goal`, `errorText`, and `stackPathHints` in [types.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/types.ts:133) and [intent.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/intent.ts:128).
- A canonical boundary schema should align with this vocabulary so query intent and stored applicability can later meet cleanly in Phase 54.

### Graph extraction already recognizes several boundary-like dimensions

- Query-time graph extraction already derives `environment`, `prerequisite`, and version-like nodes from normalized text in [graph-extract.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/graph-extract.ts:344).
- Those dimensions should be backed by a contracts-layer schema instead of living only as free-text extraction artifacts.

### Knowledge contracts are missing a first-class boundary object

- Knowledge entries currently have labels, content, lifecycle, review history, and notes, but no dedicated applicability structure in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:83).
- That is the main contract gap this phase should close.

</code_context>

<specifics>
## Specific Ideas

- Model context boundaries as structured groups, for example:
  - stacks
  - environments
  - stages
  - topologies
- Model version boundaries as tuples like:
  - subject
  - range
  - mode
- Model signals separately from context:
  - error text fragments
  - symptom phrases
  - keywords
- Model evidence as:
  - source
  - confidence
  - verifiedAt
  - verifiedBy
- Keep a minimal initial vocabulary and allow future expansion without breaking stored data.

</specifics>

<deferred>
## Deferred Ideas

- Rich expression language for arbitrary boolean boundary logic
- Automatic synonym ontology for all stack/environment values
- Probabilistic confidence scoring in the contracts layer
- Cross-entry conflict inference based purely on boundary overlap

</deferred>
