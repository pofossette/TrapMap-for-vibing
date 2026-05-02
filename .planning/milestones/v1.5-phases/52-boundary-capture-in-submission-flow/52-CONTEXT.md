# Phase 52: Boundary Capture in Submission Flow - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap and the applicability-boundary analysis

<domain>
## Phase Boundary

Phase 52 should wire the applicability-boundary schema into submission, pre-review, and reviewer confirmation flows.

This phase is about input capture and human confirmation. It is not about search indexing or retrieval-time scoring.

In scope:
- Extend trap and skill submission payloads to accept optional boundary input
- Add CLI-side submission support for structured boundary JSON
- Run agent pre-review extraction to propose candidate boundaries from submitted content
- Show candidate and user-supplied boundaries to reviewers as editable review inputs
- Persist reviewer-confirmed boundaries on approved knowledge or artifacts

Out of scope:
- Facet indexing and graph-node generation
- Retrieval filtering and ranking logic
- Feedback-driven lifecycle transitions
- Batch retrofit of old corpus entries beyond the minimum compatibility path

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- Boundary capture must support three sources of truth at once:
  - submitter input
  - agent extraction
  - reviewer final decision
- Reviewer confirmation is mandatory before publication because applicability claims are part of content trustworthiness, not optional metadata.
- Boundary capture should be optional at the transport level initially so old clients do not break, but missing boundaries should remain visible to reviewers.
- Agent extraction should be additive and inspectable. It must not silently overwrite explicit user input.

### Target direction

- Extend contracts for knowledge submission, candidate submission, and artifact import/update paths with an optional boundary payload.
- Reuse existing review-note and pre-review patterns instead of creating a separate moderation system.
- Present diffs between:
  - submitted boundary
  - extracted boundary
  - reviewer-approved boundary
- Preserve provenance so later audits can tell who asserted each boundary and whether it was verified.

</decisions>

<code_context>
## Existing Code Insights

### Knowledge submission already has a structured review pipeline

- Trap/knowledge submissions already flow through schema validation, agent pre-review, reviewer queue, and reviewer decision handling in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:109), [review.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/review.ts:20), and [KNOWLEDGE_LIFECYCLE.md](/home/wunai/Disks/Data/my-project/Trap-Map/docs/architecture/components/KNOWLEDGE_LIFECYCLE.md).
- Phase 52 should extend that pipeline instead of inventing a parallel boundary approval workflow.

### Candidate ingestion already separates upload from later decisions

- Async candidate ingestion for trap/skill uploads already persists original payload plus later analysis state in [candidates.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/candidates.ts:141).
- That makes it a natural place to store extracted boundary candidates before publication.

### Agent review already stores risk and notes but not applicability output

- The current agent review result models correctness, duplicate, and completeness risks in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:14).
- Phase 52 needs either an additive extraction payload or a sibling review artifact so applicability inference is first-class and not hidden inside free-form notes.

### Skill artifact derivation already distinguishes content from metadata

- Artifact contracts separate source files, derived capsules, and client activation manifests in [artifacts.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/artifacts.ts:233).
- Boundary capture should remain metadata attached to the artifact or capsule surface, not get mixed into activation-only file descriptors.

</code_context>

<specifics>
## Specific Ideas

- Add `--boundary <json>` to CLI submission commands for both trap and skill paths.
- Allow a draft review object shaped like:
  - `submittedBoundary`
  - `extractedBoundary`
  - `approvedBoundary`
- Capture reviewer actions such as:
  - accept extracted boundary
  - edit boundary fields
  - remove unsupported exclusions
- Make missing boundary layers explicit in review UI so reviewers can reject low-context submissions.

</specifics>

<deferred>
## Deferred Ideas

- Natural-language boundary editing in the CLI
- Automatic backfill over the entire historical corpus
- Per-field reviewer approval state beyond a single approved boundary snapshot
- Fine-grained reviewer suggestions workflow for submitter iteration

</deferred>
