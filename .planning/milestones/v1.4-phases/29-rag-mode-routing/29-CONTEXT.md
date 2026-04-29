# Phase 29: RAG Mode Routing - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Derived from project state, existing codebase, and LightRAG comparison

<domain>
## Phase Boundary

Phase 29 should unify TrapMap's retrieval strategies behind a clearer mode/routing layer without breaking existing governance boundaries or the current v1/v2 compatibility story.

This phase is about retrieval architecture and routing, not benchmark execution or CI wiring.

In scope:
- Define a clearer retrieval mode model for current and next-step APIs
- Unify routing logic across legacy entry retrieval and capsule-native retrieval
- Introduce any missing internal retrieval channels needed for mode parity
- Preserve governance-first filtering before any recall or rerank logic

Out of scope:
- Full benchmark dataset expansion
- CI workflow/reporting changes
- Large judge-based evaluation work beyond what is needed to support mode traceability

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- Keep `/v1/retrieval/search` and `/v2/retrieval/search` backward-compatible unless a new `/v3` surface is clearly justified during plan phase.
- Prefer a shared internal strategy layer over duplicating mode logic in route handlers.
- Governance filtering must remain a precondition, not a post-filter patch.
- Deterministic fallback paths should remain available for local and CI use.

### Target direction

- Treat current `semantic`, `hybrid`, and `graph-assisted` as existing retrieval primitives, not the final product-facing taxonomy.
- Add a clearer mode story closer to `naive / local / global / hybrid / mix / auto`, but map it onto TrapMap's current artifact and knowledge models rather than copying LightRAG literally.
- Keep model-assisted routing optional. Start with deterministic routing from parsed intent and query shape.

</decisions>

<code_context>
## Existing Code Insights

### Current retrieval contracts

- v1 supports explicit mode selection via `semantic`, `hybrid`, and `graph-assisted` in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:9).
- v2 is capsule-native but currently has no explicit mode field in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:149).

### Current retrieval orchestration

- v1 has a mature orchestrator with eligibility filtering, mode dispatch, citations, summary, and refinement hooks in [orchestrator.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/orchestrator.ts:98).
- v2 currently performs parsed-intent capsule ranking only, with no equivalent mode abstraction in [orchestrator.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/orchestrator.ts:610).

### Existing recall building blocks

- Semantic recall exists for legacy knowledge entries in [semantic.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/recall/semantic.ts:1).
- Keyword recall exists and already reuses persisted token state in [keyword.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/recall/keyword.ts:1).
- Graph-assisted recall exists with authorization-safe one-hop expansion in [graph-assisted.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/recall/graph-assisted.ts:1).
- Capsule ranking exists and is driven by parsed seed intent in [capsule-recall.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/capsule-recall.ts:353).

### Existing artifact-derived data

- Skill artifacts already derive `profile`, `capsules`, and `clientManifest` in [store.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/store.ts:266).
- That means a profile-centric or excerpt-like route can be added without inventing a new artifact model from scratch.

### Existing intent parsing

- Query parsing is heuristic and deterministic today in [intent.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/retrieval/intent.ts:1).
- This is a good base for `auto` mode routing before introducing LLM-based classifiers.

</code_context>

<specifics>
## Specific Ideas

- Build a shared internal `RagMode` or strategy enum that can serve both entry retrieval and capsule retrieval.
- Evaluate whether `profile` retrieval should become the equivalent of a global/context mode for skill-native search.
- Consider adding an excerpt/reference-text recall channel for `mix` mode so v2 is not limited to capsule text only.
- Add trace metadata for selected mode, routing reason, and channel contributions so later evaluation can score mode quality.
- Review whether current rerank heuristics are enough once multiple artifact-native channels are merged.

</specifics>

<deferred>
## Deferred Ideas

- LLM-based router for mode selection
- New public API version unless internal cleanup proves insufficient
- Heavier abstractive answer generation changes

</deferred>
