# Phase 33: Async Candidate Ingest and Duplicate Decision Queue - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the duplicate-management workflow request and the current skill/trap split direction

<domain>
## Phase Boundary

Phase 33 should introduce the asynchronous ingestion boundary for new skill and trap submissions so duplicate analysis happens after upload, not inline in the request path.

This phase is about candidate capture, duplicate detection, and durable provenance. It is not about final merge publication or CLI fetch ergonomics.

In scope:
- Accept uploads into a candidate/submission store without immediately publishing a new skill artifact
- Persist the original submitted payload and derived analysis snapshot for later review
- Run duplicate detection asynchronously against both existing skill artifacts and existing trap/knowledge entries
- Produce a repeatable duplicate-case record that can feed manual resolution
- Keep the existing published item untouched while a new candidate is under review

Out of scope:
- Client-side fetch/download UX
- Manual result upload and result schema validation
- Final publish, merge, trim, or supersede reconciliation
- Physical deletion of original uploaded content

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The original uploaded bundle must be stored immutably before any duplicate workflow decision is applied.
- The analysis job should be asynchronous so import latency stays low and duplicate comparison can scale with corpus size.
- Duplicate detection must compare against both published skill artifacts and legacy trap/knowledge records, because the user-facing workflow treats them as related knowledge streams.
- A duplicate case should retain the candidate ID, the matched existing ID or IDs, the similarity summary, and the original analysis snapshot.

### Target direction

- Introduce a submission/candidate layer with explicit lifecycle states such as `received`, `queued`, `analyzing`, and `duplicate_detected`.
- Emit a stable duplicate-case record that can survive retries and later manual review.
- Keep exact duplicate and semantic duplicate signals distinct so later phases can decide whether the case is large-scale overlap or small-scale overlap.

</decisions>

<code_context>
## Existing Code Insights

### Current knowledge submission path

- Trap/knowledge submissions currently run pre-review inline in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/knowledge.ts:38) and [pre-review.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/pre-review.ts:11).
- That inline path is the main place that needs to become candidate-first for the new workflow.

### Current artifact import path

- Skill artifact import currently normalizes the bundle and immediately creates a published artifact in [operations.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations.ts:430).
- The new workflow needs to split normalization from publication so candidates can be held back until a manual outcome exists.

### Existing artifact and derived data model

- Skill artifacts already persist canonical revisions, derived capsules, and client manifests in [store.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/store.ts:361).
- That derived shape is the natural place to compute candidate fingerprints and duplicate features.

### Existing duplicate signal

- Knowledge review already carries a duplicate-risk signal in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:18).
- The new workflow should promote that concept from a review note into a first-class duplicate-case model.

</code_context>

<specifics>
## Specific Ideas

- Add a candidate store and analysis job record that preserves:
  - original uploaded payload
  - derived profile/capsule snapshot
  - duplicate matches
  - queue timestamps
- Use a single duplicate detector that can score both skill artifacts and trap/knowledge entries against the candidate fingerprint.
- Make the duplicate output explicit about overlap size so later manual handling can distinguish large-area merges from small-area trims.
- Keep the published source untouched while the candidate is in `analyzing` or `duplicate_detected` state.

</specifics>

<deferred>
## Deferred Ideas

- CLI fetch command for downloading the duplicate-case bundle
- Manual resolution result schema and validation
- Final merge/trim/supersede publication logic
- Automatic cluster cleanup after a case is resolved

</deferred>
