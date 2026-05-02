# Phase 18: CLI Skill Lookup Commands - Context

**Gathered:** 2026-05-02
**Status:** Backfilled for phase index consistency
**Mode:** Auto-generated from roadmap and phase artifacts

<domain>
## Phase Boundary

Enable governed skill lookup from the CLI so users and agents can search skill artifacts by content text and receive stable identifiers plus brief metadata.

</domain>

<decisions>
## Implementation Decisions

- Keep the output artifact-first rather than dumping full capsule content.
- Reuse existing governance rules so search results stay team-safe and level-safe.

</decisions>

<code_context>
## Existing Code Insights

- The CLI/server implementation is already present under `packages/cli/src/commands/skill.ts` and retrieval helpers/routes.
- This directory has plan and summary artifacts but did not have a normalized `context.md` entrypoint.

</code_context>

<specifics>
## Specific Ideas

- Support both human-readable output and JSON mode.
- Keep the command surface agent-friendly and deterministic.

</specifics>

<deferred>
## Deferred Ideas

- Skill editing and review workflows were intentionally split into Phases 19 and 20.

</deferred>
