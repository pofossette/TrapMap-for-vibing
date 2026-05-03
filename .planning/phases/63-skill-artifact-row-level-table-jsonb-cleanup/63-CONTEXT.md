# Phase 63: Skill Artifact Row-Level Table & JSONB Cleanup - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Complete the row-level migration with `skill_artifacts` and `artifact_revisions` tables, then remove JSONB shadow writes and downgrade `store_snapshot` to a cold backup/legacy role.

This phase completes the write-path decomposition started in Phase 61 (candidates) and Phase 62 (knowledge entries) by extracting skill artifacts from the JSONB snapshot into dedicated row-level tables.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key decisions to make:
1. Table schema design for `skill_artifacts` (mirror `knowledge_entries` pattern)
2. Table schema design for `artifact_revisions` (append-only revision history)
3. `PgArtifactRepository` CRUD implementation
4. JSONB shadow write removal strategy
5. Migration script for data consistency validation

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

Reference phases:
- Phase 61: Candidate Pipeline Independent Table (pattern reference)
- Phase 62: Knowledge Entry Row-Level Table (pattern reference)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description and success criteria.

Success Criteria from ROADMAP:
1. `skill_artifacts` table mirrors `knowledge_entries` pattern with artifact-specific fields
2. `artifact_revisions` table stores append-only revision history with derived outputs (profile, capsules, clientManifest)
3. `PgArtifactRepository` implements full CRUD matching existing skill artifact mutation patterns
4. JSONB shadow writes removed: `StoreData.candidateSubmissions`, `StoreData.knowledgeEntries`, `StoreData.skillArtifacts` no longer populated in `store_snapshot`
5. `store_snapshot` retains only low-volume collections (users, teams, sessions, auditEvents, counters) or is deprecated entirely
6. All production routes and tests pass without JSONB dependency for the three decomposed domains
7. Migration script validates data consistency between decomposed tables and any remaining JSONB state

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
