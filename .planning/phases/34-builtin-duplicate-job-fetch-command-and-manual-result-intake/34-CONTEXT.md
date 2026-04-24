# Phase 34: Built-in Duplicate Job Fetch Command and Manual Result Intake - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Derived from the manual duplicate-resolution workflow request

<domain>
## Phase Boundary

Phase 34 should add the client-facing command path for duplicate jobs so reviewers can obtain the candidate bundle and submit a manual resolution result without using raw `curl`.

This phase is about operator ergonomics and manual result intake, not about the final publish/merge rules.

In scope:
- Add a built-in client command that fetches duplicate-job content locally
- Have the command output the retrieval command after a duplicate decision is selected
- Provide a server endpoint or adapter path that returns the duplicate-job payload in a client-friendly format
- Accept manual result submissions for jobs that are waiting on reviewer action
- Keep the job payload downloadable with the original candidate and the matched existing artifact data

Out of scope:
- Revalidating and publishing the manual result
- Final merge/revision application to published artifacts
- Non-cli web UI for duplicate review
- Replacing the queue model introduced in Phase 33

</domain>

<decisions>
## Implementation Decisions

### Working assumptions

- The fetch path must be client-native and discoverable from the CLI, not an external `curl` example.
- After a duplicate decision is selected, the CLI should print a concrete local fetch command that the reviewer can rerun later.
- The fetch payload should include enough information to edit offline: original submission bundle, matched published artifact bundle, duplicate analysis summary, and the expected return schema.
- Manual result intake should be job-scoped so the same job can be retried or corrected without rewriting the original submission record.

### Target direction

- Prefer a `skill duplicate-job ...` style command family or equivalent to keep the operator flow in one namespace.
- Make the fetch output explicit about the candidate versus existing artifact IDs so reviewers can reason about which side they are editing.
- Keep the intake API narrow: the job result should describe either two independent skills or one merged skill, plus notes.

</decisions>

<code_context>
## Existing Code Insights

### Existing CLI command structure

- The CLI already has a dedicated `skill` namespace in [skill.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/cli/src/commands/skill.ts:1).
- That is the natural place for a duplicate-job fetch/intake command family.

### Existing import/export workflow

- Artifact import/export already exists in [operations.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/routes/operations.ts:430), so duplicate-job fetch can reuse the same server-side bundle formatting patterns.
- The new command should not invent a second unrelated payload shape if the existing artifact bundle format can be reused or adapted.

### Existing CLI output conventions

- The CLI already prints structured text and JSON for skill operations in [skill.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/cli/src/commands/skill.ts:1).
- Duplicate-job fetch should follow the same shell-friendly output style and optionally print a ready-to-run local command.

### Existing store and provenance data

- Candidate provenance from Phase 33 should keep the original upload and matched artifact IDs available for download.
- The fetch command should surface that provenance rather than reconstructing it client-side.

</code_context>

<specifics>
## Specific Ideas

- Add a command that prints a local fetch instruction after the reviewer chooses a duplicate case.
- Support a structured download response that contains:
  - job metadata
  - candidate upload bundle
  - matched existing artifact bundle
  - duplicate analysis summary
  - expected manual result schema
- Add a manual result submission path that distinguishes:
  - two independent skills
  - one merged skill
- Keep the intake flow retryable so a bad manual payload can be replaced without losing the original job.

</specifics>

<deferred>
## Deferred Ideas

- Final revalidation and publish logic
- Rich diff rendering in the CLI
- Browser-based duplicate review UI
- Automatic command generation for downstream patch application

</deferred>
