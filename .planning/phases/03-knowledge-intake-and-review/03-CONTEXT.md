# Phase 3: Knowledge Intake and Review - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Turn pitfall submissions into durable, reviewable knowledge entries with preserved revision history, agent pre-review, admin review decisions, and CLI workflows for submitters and reviewers.

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices are at the agent's discretion because discuss was skipped for this autonomous run. The implementation should stay prototype-friendly while preserving the knowledge lifecycle:
- Keep lifecycle history explicit and queryable instead of mutating entries in place without trace
- Run agent pre-review before admin review and store its result alongside the submission
- Treat review and resubmission as state transitions on the same knowledge object rather than disconnected records
- Use the existing auth/RBAC model to gate review and update privileges

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/contracts/src/domain/knowledge.ts` and `packages/contracts/src/domain/review.ts` already define a baseline knowledge and review schema surface
- `packages/server/src/lib/store.ts` already persists teams, memberships, sessions, and placeholder knowledge arrays
- The CLI already persists session state and has authenticated request helpers

### Established Patterns
- Server routes are split into Fastify route modules under `packages/server/src/routes`
- RBAC decisions live in `packages/server/src/lib/rbac.ts`
- Contracts remain the shared runtime validation source between CLI and server

### Integration Points
- Knowledge submissions must inherit the current session's team and security context
- Pre-review should plug into the server before review queue exposure
- CLI commands should reuse the same config/http/output helpers introduced in Phase 2

</code_context>

<specifics>
## Specific Ideas

No additional user-specific product choices were supplied. Keep knowledge objects concise enough for terminal use while preserving enough history for trustworthy review.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
