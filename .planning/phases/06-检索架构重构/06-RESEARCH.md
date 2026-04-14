# Phase 6: 检索架构重构 - Research

**Date:** 2026-04-14
**Status:** Complete
**Scope:** Phase 6 only

## Research Question

What needs to be true for Phase 6 to restructure retrieval into an extensible RAG skeleton without changing current product behavior?

## Inputs Reviewed

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `packages/server/src/lib/retrieval.ts`
- `packages/server/src/routes/retrieval.ts`
- `packages/server/src/lib/retrieval.test.ts`
- `packages/server/src/lib/retrieval-workflow.test.ts`
- `packages/server/src/routes/retrieval.test.ts`
- `packages/contracts/src/domain/retrieval.ts`
- `packages/cli/src/commands/retrieval.ts`

## Current State Summary

- Retrieval behavior is concentrated in `packages/server/src/lib/retrieval.ts`.
- The current module mixes four concerns in one file: eligibility filtering, semantic recall, result shaping, and optional refinement.
- The public API contract is stable and simple: request fields are `seed`, `filters`, `maxResults`, and `includeRefinement`; response fields are `globalConstraints`, `projectKnowledge`, and `refinementSummary`.
- Route and CLI layers are already thin wrappers over shared contracts, which is aligned with BOUND-01 and BOUND-02.
- Approval, RBAC, team scoping, and lifecycle checks already live in the server-side retrieval pipeline, which Phase 6 must preserve.

## Architectural Recommendation

Create a dedicated retrieval module tree under `packages/server/src/lib/retrieval/` and keep `packages/server/src/lib/retrieval.ts` as a compatibility shim or narrow facade during the transition.

Recommended layout:

- `packages/server/src/lib/retrieval/orchestrator.ts`
  - Entry point for `searchKnowledge`
  - Owns pipeline order only
- `packages/server/src/lib/retrieval/filters.ts`
  - Approval, security level, team, scope, and label filters
- `packages/server/src/lib/retrieval/recall/semantic.ts`
  - Current embedding-based recall path
- `packages/server/src/lib/retrieval/assembly.ts`
  - Match shaping, bucket split, and response assembly
- `packages/server/src/lib/retrieval/types.ts`
  - Internal pipeline interfaces and recall mode contracts

This keeps Phase 6 focused on architecture extraction, while Phase 7 and Phase 9 can add new recall channels without reopening route or CLI boundaries.

## Query Mode Interface Recommendation

Add a shared query mode enum in contracts with these values:

- `semantic`
- `hybrid`
- `graph-assisted`

Add an optional `mode` field to `retrievalQuerySchema` with default `semantic`.

Why this is the right Phase 6 scope:

- It satisfies ARCH-06 now without enabling new retrieval behavior prematurely.
- It preserves backward compatibility because existing callers omit `mode` and continue to get semantic retrieval.
- It establishes the dispatch seam the server orchestrator will use in later phases.

## Required Invariants

Phase 6 plans must preserve these invariants:

- Response shape remains `globalConstraints + projectKnowledge + refinementSummary`.
- Scope still means business scope, not retrieval mode.
- Approval, permission, and team filtering happen before recall and before response shaping.
- CLI continues to depend only on shared contracts and server API behavior.
- Retrieval enhancements remain inside the server boundary.

## Risks

### Risk 1: Hidden behavior change during extraction

If the orchestrator extraction moves logic without preserving execution order, unapproved or cross-team entries could leak into candidate sets.

Mitigation:

- Make the pipeline order explicit in the orchestrator.
- Add regression tests that prove approval and team filters happen before recall output is assembled.

### Risk 2: Contract drift across server and CLI

If the query mode field is added in the server only, the CLI and tests will silently diverge.

Mitigation:

- Add `mode` in `packages/contracts/src/domain/retrieval.ts` first.
- Update CLI to expose `--mode` using the shared enum values.

### Risk 3: Future phases forced to reopen Phase 6 files

If semantic-specific details remain embedded in the orchestrator, later hybrid and graph work will require risky rewrites.

Mitigation:

- The orchestrator should dispatch through a mode-oriented recall interface even if Phase 6 only wires `semantic`.

## Missing Input Noted

`.planning/REQUIREMENTS.md` references `docs/retrieval-structure-adjustment.md`, but that document is not present in the repository. Planning therefore relies on the roadmap, requirements, and current codebase rather than a separate product design doc.

## Validation Architecture

Phase 6 validation should prove two things:

1. The architecture is actually split into orchestrator / filters / recall / assembly seams.
2. Product behavior is unchanged for the current semantic path.

Recommended automated coverage:

- Unit tests for filter eligibility rules after extraction
- Unit tests for semantic recall path and bucket assembly
- Route or workflow tests proving the response schema stays unchanged
- Contract tests proving `mode` defaults to `semantic`
- Typecheck over contracts, CLI, and server together

Recommended commands:

- Quick: `pnpm --filter @skill-shareer/server test -- src/lib/retrieval.test.ts src/lib/retrieval-workflow.test.ts src/routes/retrieval.test.ts`
- Full: `pnpm test && pnpm typecheck`

## Planning Implications

- Plan 01 should establish the orchestrator seam with no behavior change.
- Plan 02 should extract filters, recall, and assembly into dedicated modules with regression tests.
- Plan 03 should add the shared query mode interface and route/CLI wiring while keeping `semantic` as the default path.

## Research Conclusion

Phase 6 should be treated as an internal architecture refactor with a small contract addition (`mode`) and strong regression coverage. The safest path is to preserve current imports and response shape while introducing a retrieval module structure that later phases can extend.
