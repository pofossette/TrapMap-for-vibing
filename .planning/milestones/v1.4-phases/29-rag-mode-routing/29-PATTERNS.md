# Phase 29: Pattern Map

**Created:** 2026-04-23
**Purpose:** Closest existing code patterns to reuse for Phase 29 planning and implementation.

## File Pattern Map

| Target Area | Likely Files | Closest Analog | Why |
|-------------|--------------|----------------|-----|
| Retrieval mode contracts | `packages/contracts/src/domain/retrieval.ts` | `packages/contracts/src/domain/retrieval.ts` | Existing v1 mode enum and v2 retrieval contracts already live here. |
| Shared router selection | `packages/server/src/lib/retrieval/orchestrator.ts` or new helper under `packages/server/src/lib/retrieval/` | `dispatchByMode()` in `packages/server/src/lib/retrieval/orchestrator.ts` | This is the current v1 strategy dispatcher and the natural extraction seam. |
| Deterministic intent-driven selection | `packages/server/src/lib/retrieval/intent.ts` | `parseSeedIntent()` in `packages/server/src/lib/retrieval/intent.ts` | Current deterministic parser already derives query shape without model calls. |
| Capsule strategy execution | `packages/server/src/lib/retrieval/capsule-recall.ts` and `packages/server/src/lib/retrieval/orchestrator.ts` | `rankCapsules()` and `searchKnowledgeV2()` | Existing v2 retrieval path should be reused, not replaced. |
| Response shaping and trace-friendly assembly | `packages/server/src/lib/retrieval/assembly.ts` | `buildRetrievalResponse()` and `buildV2RetrievalResponse()` | Route-specific shaping is already separated from recall logic. |
| Evaluation report/baseline integration | `evals/retrieval/**` | Phase 28 report flow and existing retrieval eval modules | Existing evaluation/reporting artifacts are the baseline substrate for EOPS-03. |

## Reusable Code Excerpts

### Existing v1 mode dispatch

From `packages/server/src/lib/retrieval/orchestrator.ts`:

- `dispatchByMode(mode, seed, eligibleEntries, parsed)` switches over `semantic`, `hybrid`, and `graph-assisted`.
- This should be extracted or wrapped rather than duplicated in route handlers.

### Existing deterministic query analysis

From `packages/server/src/lib/retrieval/intent.ts`:

- `parseSeedIntent(seed)` already provides deterministic structured cues.
- This is the right input for any initial `auto` routing behavior.

### Existing v2 governed recall

From `packages/server/src/lib/retrieval/orchestrator.ts` and `packages/server/src/lib/retrieval/capsule-recall.ts`:

- `searchKnowledgeV2()` already enforces parse -> snapshot -> governed artifacts -> rank capsules -> assemble response.
- Any shared router must preserve this ordering.

### Existing evaluation/report slices

From Phase 28 summaries and `evals/retrieval/`:

- Reporting and CI already exist.
- Phase 29 should add stable mode IDs, routing reasons, and failure-policy metadata to those outputs rather than inventing a new reporting path.

## Planning Notes

- Reuse `dispatchByMode()` as the extraction seam for a router helper.
- Keep route-family separation at assembly time.
- Add stable trace fields before trying to lock regression thresholds.
