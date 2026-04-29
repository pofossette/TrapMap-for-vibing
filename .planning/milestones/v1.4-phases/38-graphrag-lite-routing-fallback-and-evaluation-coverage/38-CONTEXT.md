# Phase 38: GraphRAG-lite Routing Fallback and Evaluation Coverage - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the GraphRAG-lite discussion for confidence-aware rollout

<domain>
## Phase Boundary

Phase 38 should integrate the new GraphRAG-lite plan path into routing, logging, fallback behavior, and evaluation so it can be turned on without destabilizing existing retrieval.

This phase is about rollout safety and regression coverage. It is not about first-principles indexing or first-pass plan compilation.

In scope:
- Add routing support for the GraphRAG-lite path as an additive retrieval option
- Compute confidence or readiness signals that decide whether the graph-plan result should be returned
- Fall back to existing governed retrieval paths when graph-plan confidence is low or the plan is incomplete
- Extend logging and trace metadata so route selection and fallback decisions are auditable
- Add evaluation coverage for graph-plan behavior, fallback behavior, and governance safety

Out of scope:
- New graph extraction logic
- New plan compiler heuristics beyond what Phase 37 provides
- Heavy benchmark generation unrelated to the new route
- Large-scale prompt tuning or model experimentation

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- GraphRAG-lite should be introduced as an additive route, not a replacement for current v1/v2 retrieval.
- GraSP explicitly uses confidence-based routing, so fallback is a feature, not a failure mode to hide.
- Governance filtering must still happen before route selection and before any fallback result is returned.
- Evaluation must explicitly check for unauthorized leakage, missing blockers, and over-sized skill plans.

### Target direction

- Add a route family or mode that can select GraphRAG-lite, then fall back to capsule-native or graph-assisted retrieval when the compiler lacks confidence.
- Record routing reasons such as low confidence, insufficient trap evidence, or missing skill evidence.
- Reuse the existing retrieval logging and evaluation stack rather than creating a second reporting path.
- Prefer deterministic confidence heuristics first so regression tests stay stable.

### Paper-grounded constraints

- GraSP uses calibrated retrieval confidence to decide whether structured execution should be trusted at all. Phase 38 should preserve that core idea even if TrapMap uses simpler deterministic features instead of the paper’s full confidence model.
- GraSP reports a no-regression posture by falling back to reactive control when confidence is low. For TrapMap, the analogous no-regression property is fallback to existing v2 capsule retrieval or v1 graph-assisted retrieval.
- GraSP increases repair budgets in the mid-confidence band. TrapMap can adapt that idea by widening evidence collection or relaxing plan compression before fully abandoning the graph-plan path.
- Evaluation should reflect the paper’s thesis that orchestration beats volume: tests should penalize oversized plans and confirm that a smaller focused plan still covers the key blockers.

### Library posture

- No major new library should be introduced purely for routing and eval wiring.
- The graph dependencies are already fixed by earlier phases and should be reused rather than expanded here:
  - `graphology`
  - `graphology-dag`
  - `graphology-operators`
  - `graphology-shortest-path`
- Continue to reuse the existing eval harness, retrieval logging, and contract tests.
- If confidence calibration later becomes statistically complex, consider a small focused math/statistics utility only when the benefit is clear; do not preemptively add one in this phase.

</decisions>

<code_context>
## Existing Code Insights

### A deterministic router already exists

- The retrieval orchestrator already has explicit routing decisions in [orchestrator.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/orchestrator.ts:101) and [orchestrator.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/orchestrator.ts:130).
- Phase 38 should extend that pattern rather than introduce implicit route selection.

### Existing fallback destinations are already useful

- The current product already supports entry-based graph-assisted retrieval in [orchestrator.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/retrieval/orchestrator.ts:555).
- It also supports capsule-native skill retrieval in [routes/retrieval.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/routes/retrieval.ts:52).
- Those are the natural fallback targets when GraphRAG-lite cannot produce a confident plan.

### Logging and eval infrastructure already exists

- Retrieval logging already captures route metadata and pipeline steps in [rag-log.ts](/home/wunai/project/TrapMap-for-vibing/packages/server/src/lib/rag-log.ts:26).
- Retrieval and summary eval datasets already exist under [evals/retrieval](/home/wunai/project/TrapMap-for-vibing/evals/retrieval) and [evals/summary](/home/wunai/project/TrapMap-for-vibing/evals/summary).
- Phase 38 should extend those surfaces instead of inventing a separate benchmark harness.

</code_context>

<specifics>
## Specific Ideas

- Add route reasons such as:
  - `graph-plan-selected`
  - `graph-plan-low-confidence-fallback-v2`
  - `graph-plan-insufficient-skill-evidence`
- Add eval assertions for:
  - trap-first ordering
  - default max focused skill count
  - correct fallback destination
  - governance-safe result filtering
- Keep routing trace visible in logs so regressions can be diagnosed from artifacts instead of re-running requests manually.

</specifics>

<deferred>
## Deferred Ideas

- Model-based confidence estimation
- Community-level graph query families
- Advanced online experimentation and canary rollout tooling
- Expensive global graph summaries

</deferred>
