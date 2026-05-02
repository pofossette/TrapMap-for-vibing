# Phase 26: Retrieval Metrics Runner and Governance Checks - Context

**Gathered:** 2026-05-02
**Status:** Backfilled for phase index consistency
**Mode:** Auto-generated from roadmap and phase artifacts

<domain>
## Phase Boundary

Turn the evaluation contracts into a runnable retrieval evaluation flow with ranking metrics and governance-failure detection against real TrapMap retrieval surfaces.

</domain>

<decisions>
## Implementation Decisions

- Score relevance and governance separately so strong ranking numbers cannot hide permission leakage.
- Keep execution close to real endpoints or governed adapters rather than building a disconnected benchmark harness.

</decisions>

<code_context>
## Existing Code Insights

- The codebase already contains the retrieval runner, normalization, metrics, assertions, and reporting modules under `evals/retrieval/`.
- This phase directory had implementation artifacts but no normalized `context.md` entrypoint.

</code_context>

<specifics>
## Specific Ideas

- Report Hit@K, MRR, nDCG, and Recall@K.
- Detect forbidden-result leakage, scope violations, and expected-empty mismatches.

</specifics>

<deferred>
## Deferred Ideas

- Summary evaluation and CI integration were intentionally split into later phases.

</deferred>
