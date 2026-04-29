# Phase 37: GraphRAG-lite Retrieval Compiler for Trap-First Skill Plans - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the GraphRAG-lite discussion for trap-first orchestration

<domain>
## Phase Boundary

Phase 37 should compile governed trap and skill retrieval candidates into a minimal trap-first execution plan instead of returning another flat list of matches.

This phase is about plan assembly and ranking. It is not about route fallback policy or evaluation plumbing.

In scope:
- Retrieve governed trap and skill candidates from the existing retrieval surfaces
- Build a structured trap-first plan with blocking traps, recommended skills, and typed edges
- Limit the default output to a small focused plan rather than a large graph dump
- Attach verifier-oriented metadata such as preconditions, expected effects, and activation hints where available
- Reuse citations only from already-filtered, authorized sources

Out of scope:
- Public contract hardening for the final response shape
- Confidence routing and fallback to legacy paths
- Global/community graph queries
- Prompt-heavy answer generation

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The GraphRAG-lite output should be a structured plan, not a long answer or a larger result list.
- Trap handling must come first: blockers and guardrails should be surfaced before skill recommendations.
- The GraSP paper and related skill-orchestration findings indicate that a small focused skill set outperforms comprehensive documentation, so the best default output is a small set of focused skills, not an exhaustive action tree.
- Existing activation metadata should be reused rather than inventing a second activation system.

### Target direction

- Build a compiler that merges trap-side and skill-side candidates after governance filtering, then emits a minimal typed graph.
- Prefer 2-3 focused skill nodes by default unless the evidence clearly requires more.
- Use typed relations such as `risk-blocks`, `mitigates`, `requires`, and `order` so the output is actionable rather than descriptive.
- Keep all summaries extractive or evidence-backed; no uncited synthesis from content that failed governance filters.

### Paper-grounded constraints

- GraSP defines the missing middle layer between retrieval and execution as a typed DAG compiler. Phase 37 should adopt that spirit directly: the compiler must answer “how do these pieces depend on each other, and what is the minimal plan?” rather than merely re-rank candidates.
- GraSP requires executable nodes to carry schema, bound arguments, and verifier information. TrapMap does not need full agent runtime execution, but skill nodes should still expose verifier-oriented metadata such as prerequisites, expected effects, and activation affordances.
- GraSP separates hard dependency edges from softer order edges. The compiler should preserve that distinction so a later repair or fallback path can safely relax ordering without discarding true blockers.
- GraSP localizes failure impact to descendants instead of throwing away the entire plan. Even if TrapMap does not implement repair operators immediately, the compiler should emit a graph shape that could support locality-bounded recovery later.

### Library posture

- This phase does not justify importing a whole planning framework.
- Reuse the exact graph stack selected in Phase 36:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Expected uses in this phase:
  - topological ordering
  - descendant invalidation
  - bounded neighborhood inspection
  - focused subgraph extraction around candidate traps and skills
- Keep scoring, trap/skill heuristics, and governance checks in local code because those are product-specific behaviors.

</decisions>

<code_context>
## Existing Code Insights

### Retrieval is currently split into two parallel product shapes

- Entry-based trap retrieval is implemented in [orchestrator.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/orchestrator.ts:187).
- Capsule-native skill retrieval is implemented separately in [orchestrator.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/orchestrator.ts:751).
- Phase 37 should compile across those two worlds instead of forcing users to query them separately.

### Skill lookup already provides governed artifact ranking

- Artifact-first skill lookup already exists in [skill-lookup.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/skill-lookup.ts:100).
- That ranking path can be reused or adapted instead of building a second independent skill scorer.

### Capsules already carry useful plan fields

- Skill capsules already contain `situation`, `problem`, `goal`, labels, and governance fields in [artifacts.ts](/home/wunai/project/TrapMap-for-vibing/packages/contracts/src/domain/artifacts.ts:133).
- Those are strong inputs for a compiler that needs to map a trap symptom to one or two concrete skills.

### Activation hints already exist

- The retrieval assembly layer already knows how to build activation hints for governed skill artifacts in [assembly.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/assembly.ts:188).
- The compiler should reuse those hints rather than embedding file bodies or executable content.

</code_context>

<specifics>
## Specific Ideas

- Build an internal compiler result with sections such as:
  - `blockingTraps`
  - `recommendedSkills`
  - `edges`
  - `citations`
- Let trap candidates come from existing knowledge retrieval and let skill candidates come from capsule or artifact ranking.
- Add a score-compression step so the final plan stays small and focused even if the underlying recall returns many hits.
- Promote only the trap and skill nodes that materially change operator behavior; keep the rest as citations or supporting evidence.
- Default to a 2-3 skill budget unless evidence clearly requires more, matching the “less is more” result highlighted in the GraSP paper.

</specifics>

<deferred>
## Deferred Ideas

- Confidence-based fallback
- Public route shape hardening
- Global pattern summaries across many teams or corpora
- LLM-generated long-form narrative answers

</deferred>
