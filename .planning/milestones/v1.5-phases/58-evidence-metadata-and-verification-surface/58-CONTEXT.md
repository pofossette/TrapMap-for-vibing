# Phase 58: Evidence Metadata and Verification Surface - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap expansion for low-complexity trust improvements

<domain>
## Phase Boundary

Phase 58 should add a minimal evidence and provenance model across trap and skill surfaces so users and reviewers can see where a piece of knowledge came from and how recently it was verified.

This phase is about compact trust metadata and visibility. It is not about full source graphs, full citation extraction, or automated fact checking.

In scope:
- Add minimal evidence fields such as:
  - `sourceType`
  - `sourceRef`
  - `evidenceLevel`
  - `verifiedAt`
  - `verifiedBy`
- Allow review flows to capture and update that metadata before publication
- Expose evidence metadata in retrieval and admin views as additive response fields
- Keep evidence metadata auditable and queryable

Out of scope:
- Automatic source crawling or validation
- Rich evidence ontologies
- Full provenance graph lineage across all derived capsules
- Policy engines that block publication based on evidence score alone

</domain>

<decisions>
## Implementation Decisions

### Why this is a new phase

- Existing phases 51-54 already use an `evidence` layer inside applicability boundaries, but that only covers confidence and provenance of boundary assertions.
- The broader trust gap is separate: a knowledge item itself still needs minimal evidence metadata even when no applicability-boundary logic is involved.
- Folding this into Phase 51 would blur the line between boundary schema design and corpus-wide trust metadata. Keeping it in Phase 58 preserves cleaner phase responsibilities.

### Working assumptions

- Minimal evidence metadata is high-value and low-complexity because it extends existing contracts and review surfaces without requiring a new retrieval architecture.
- The system does not need perfect factual verification to benefit. It only needs to make verification recency and evidence strength visible.
- Trap and skill models should use the same evidence vocabulary to avoid divergent governance rules.

### Target direction

- Add compact evidence metadata objects to knowledge and skill records.
- Reuse current review and audit patterns so evidence changes are tracked like other moderator decisions.
- Expose evidence visibility in retrieval without forcing clients to consume a large provenance graph.

</decisions>

<code_context>
## Existing Code Insights

### Retrieval already has citation surface but not evidence metadata

- Retrieval contracts already expose citations and summaries in [retrieval.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/retrieval.ts:19).
- That is useful for recall traceability, but it does not tell the caller whether the underlying knowledge was verified recently or what kind of evidence supports it.

### Review flow is the natural capture point

- Knowledge review and reviewer decision models already exist in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:24) and [review.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/review.ts:11).
- Phase 58 should extend that surface rather than creating a second approval path.

### Audit infrastructure can absorb evidence mutations

- Audit events are already created and queryable in [audit.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/audit.ts:8).
- Evidence metadata updates should piggyback on the same mutation/audit flow.

</code_context>

<specifics>
## Specific Ideas

- Start with a very small vocabulary for `evidenceLevel`, for example:
  - `anecdotal`
  - `reproduced`
  - `documented`
  - `verified-in-prod`
- Let `sourceType` be intentionally small at first, for example:
  - `internal-experience`
  - `incident`
  - `doc`
  - `code`
  - `external-reference`
- Expose evidence metadata in retrieval as a compact trust block rather than mixing it into citation text.

</specifics>

<deferred>
## Deferred Ideas

- Automatic trust scoring
- External source fetch and archive pipeline
- Multi-source evidence aggregation
- Machine-generated verification reports

</deferred>
