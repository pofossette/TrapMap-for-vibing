# Phase 35: Manual Result Revalidation and Publish Merge Reconciliation - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the duplicate-management workflow request

<domain>
## Phase Boundary

Phase 35 should turn a manually edited duplicate job into a validated publish action while preserving the original upload, the old published item, and the full audit trail.

This phase is about revalidation, reconciliation, and publish-side bookkeeping, not about new job fetching or queueing.

In scope:
- Re-run validation on the returned manual result before any published state changes
- Support publishing either two independent skills or one merged/fused skill outcome
- Preserve the old published skill/trap until a validated replacement or merge result is ready
- Record lineage between the original candidate, the existing published item, and the final publish target
- Keep original uploaded content available for future review and rollback reasoning

Out of scope:
- New duplicate-case discovery
- Client fetch ergonomics
- Manual result authoring UX
- Physical deletion of historical submissions or published items

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- A manual result is not trusted until it is revalidated against the same normalization and duplicate rules used earlier in the workflow.
- Publishing a merged or trimmed outcome should be additive to the audit trail, not destructive to the original records.
- If the reviewer chooses to keep two independent skills, the system should publish the candidate outcome without forcing removal of the existing one.
- If the reviewer returns one fused skill, the system should capture which side became canonical and which side was absorbed or superseded.

### Target direction

- Reuse the existing artifact revision and lifecycle model where possible, but add explicit relationship records for merged-from / merged-into / superseded-by behavior.
- Treat the original candidate, the old published item, and the final result as three separate historical facts.
- Keep the final publish step idempotent so retries do not duplicate the merge or create inconsistent lineage.

</decisions>

<code_context>
## Existing Code Insights

### Existing revision and lifecycle machinery

- Skill artifacts already keep revision history, lifecycle events, and review metadata in [store.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/store.ts:458).
- That structure can host the final reconciliation record without inventing a separate lifecycle system.

### Existing knowledge update and review flows

- Knowledge entries already support resubmission, review, update, and deactivation flows in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/knowledge.ts:38) and [operations.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations.ts:113).
- Phase 35 can borrow those lifecycle concepts for the publish reconciliation path.

### Existing derived artifact support

- Skill artifact derived outputs already include capsule/profile/manifests in [store.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/store.ts:380).
- Any merged result should be re-derived from the reconciled content rather than inheriting stale output.

### Existing review gating

- Review and permission gating already exist for knowledge and skill artifact operations in the server routes.
- Final publish should continue to respect those permissions and not bypass review boundaries.

</code_context>

<specifics>
## Specific Ideas

- Revalidate the manual result as a fresh candidate before publishing.
- Support three publish outcomes:
  - keep both independent
  - merge candidate into existing
  - merge existing into candidate
- Preserve source lineage for:
  - original upload snapshot
  - duplicate-case decision
  - manual result payload
  - final published artifact revision
- Mark absorbed or superseded items as historical instead of deleting them.

</specifics>

<deferred>
## Deferred Ideas

- Auto-generated merge suggestions from the duplicate analysis
- Conflict-aware visual diffing in the CLI
- Bulk repair for multiple duplicate cases
- Background cleanup of orphaned duplicate-case records after retention windows

</deferred>
