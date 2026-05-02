# Phase 25: Evaluation Contracts and Golden Dataset Foundation - Context

**Gathered:** 2026-05-02
**Status:** Backfilled for phase index consistency
**Mode:** Auto-generated from roadmap and phase artifacts

<domain>
## Phase Boundary

Establish the shared evaluation contracts, workspace layout, and labeled dataset foundation for retrieval evaluation across the repository.

</domain>

<decisions>
## Implementation Decisions

- Keep the evaluation stack TypeScript-native and monorepo-local.
- Separate contract/layout work from metric execution so later phases can build on a stable substrate.

</decisions>

<code_context>
## Existing Code Insights

- Phase artifacts in this directory include research, review, validation, and two implementation plans.
- The resulting contracts live under `packages/contracts/src/domain/evals/` and the repo-root `evals/` workspace.

</code_context>

<specifics>
## Specific Ideas

- Define schemas for retrieval datasets and reports.
- Support smoke/core dataset organization without binding this phase to CI or judge logic.

</specifics>

<deferred>
## Deferred Ideas

- Ranking metrics, governance assertions, and CI gating belong to later phases.

</deferred>
