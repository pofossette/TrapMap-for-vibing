# Phase 59: Ownership and Verification SLA Management - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Derived from the v1.5 roadmap expansion for lightweight corpus health management

<domain>
## Phase Boundary

Phase 59 should add lightweight ownership and verification-due management so the corpus can be maintained without introducing a heavy governance subsystem.

This phase is about operational maintenance metadata and admin workflows. It is not about decay scoring curves or full people/process management.

In scope:
- Add ownership and review scheduling fields such as:
  - `owner`
  - `reviewBy`
  - `lastVerifiedAt`
- Provide list/filter views for:
  - missing owner
  - overdue review
  - stale verification
- Provide simple maintenance actions:
  - assign owner
  - extend review date
  - mark re-verified
- Keep the phase compatible with lifecycle-state and batch-management work

Out of scope:
- Escalation/notification infrastructure
- Complex permission trees for delegated maintainers
- Team performance dashboards
- Formal SLA breach automation beyond listing and batch actions

</domain>

<decisions>
## Implementation Decisions

### Why this is a new phase

- Phase 48 handles lifecycle states and decay semantics, but it does not by itself solve the operator question of who owns an entry and who is responsible for re-verification.
- Phase 50 handles batch management over stale entries, but it needs ownership and review-due metadata to be genuinely useful.
- Keeping ownership/SLA in Phase 59 avoids overloading the decay phases with team-maintenance concerns while still giving them shared data to consume.

### Working assumptions

- Ownership metadata should be lightweight and optional at the transport level initially, but missing ownership should be visible in admin tooling.
- The system only needs enough structure to drive accountability and queue triage, not a full HR-style ownership model.
- `reviewBy` and `lastVerifiedAt` should align with Phase 48 lifecycle transitions rather than creating a competing notion of staleness.

### Target direction

- Add ownership/review scheduling metadata to trap and skill records.
- Reuse batch-management patterns from the decay work so maintainers can act on overdue knowledge in groups.
- Keep the metadata directly consumable by CLI/admin list commands.

</decisions>

<code_context>
## Existing Code Insights

### Knowledge already has owner but not maintenance scheduling

- Knowledge entries already store an `owner` actor in [knowledge.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/contracts/src/domain/knowledge.ts:92).
- The missing piece is maintenance-oriented ownership and scheduling semantics: who currently owns upkeep, when it must be re-verified, and how admins list overdue items.

### Lifecycle work already points toward last-verified semantics

- The v1.5 roadmap for Phase 48 already defines transitions based on age and `last-verified timestamp` in [.planning/ROADMAP.md](/home/wunai/Disks/Data/my-project/Trap-Map/.planning/ROADMAP.md:82).
- Phase 59 should supply the operator-facing metadata and workflows that make those transitions maintainable in practice.

### Batch workflows already exist conceptually in roadmap

- Phase 50 is already intended to support batch discovery and actions over stale entries in [.planning/ROADMAP.md](/home/wunai/Disks/Data/my-project/Trap-Map/.planning/ROADMAP.md:100).
- Ownership and review-due fields should be designed so Phase 50 can filter and act on them without extra translation layers.

</code_context>

<specifics>
## Specific Ideas

- Treat `owner` as the current maintenance owner, not only the original submitter.
- Add a simple triage listing such as:
  - no owner assigned
  - review due within N days
  - review overdue
  - never verified
- Allow a lightweight re-verification action that updates `lastVerifiedAt` and optionally evidence metadata from Phase 58.

</specifics>

<deferred>
## Deferred Ideas

- Notification delivery or reminders
- Auto-reassignment rules
- Escalation chains
- Detailed maintainer scoring dashboards

</deferred>
