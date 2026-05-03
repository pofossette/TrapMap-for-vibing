# Phase 62: Knowledge Entry Row-Level Table - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Extract knowledge entries from the JSONB snapshot into `knowledge_entries`, `knowledge_revisions`, and `lifecycle_events` tables, enabling concurrent writes to different entries and separating mutable state from append-only history.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Checker Revision Decisions (2026-05-03)

The following decisions were made during plan revision to address checker issues:

1. **COVERAGE-001 (Critical): Route Integration**
   - User decision: "Add integration plan"
   - Resolution: Added plan 62-04 (Wave 3) that integrates KnowledgeRepository into routes/processors following Phase 61's conditional repository pattern

2. **COVERAGE-002 (High): PostgreSQL SEQUENCE for ID Generation**
   - User decision: "Add SEQUENCE tasks"
   - Resolution: Added `knowledge_entry_id_seq` SEQUENCE to schema.ts (Task 1 of 62-01) and `nextId()` method to repository interface (Task 2 of 62-01) and implementation (Task 1 of 62-02)

3. **COVERAGE-003 (Medium): Index Table Verification**
   - Resolution: Added Task 4 to plan 62-02 to verify existing index tables (knowledge_embeddings, knowledge_keywords) work with new entry_id

4. **TECHNICAL-001 (Medium): knowledge.ts Module Structure**
   - Resolution: Clarified that plans intentionally create a new `knowledge/` directory structure. Task 3 of 62-01 explicitly notes this creates a new module alongside the existing `knowledge.ts` file for backward compatibility

5. **DEPENDENCY-001 (Low): File Creation vs Modification**
   - Resolution: Updated 62-01 frontmatter to use `files_created` for `knowledge/index.ts` instead of `files_modified`

6. **QUALITY-001 (Low): lifecycle_events.state Column Type**
   - Resolution: Added note in Task 1 of 62-01 that `state` TEXT column stores LifecycleState string values

</decisions>

<code_context>
## Existing Code Insights

### Phase 61 Pattern (Candidate Pipeline)
- `packages/server/src/lib/candidates/repository.ts` defines `CandidateRepository` interface with `DualWriteCandidateRepository` and `InMemoryCandidateRepository` implementations
- `packages/server/src/lib/candidates/processor.ts` uses conditional repository access: `if (services.candidateRepo) { await repo.method() } else { await store.transact() }`
- Factory function `createCandidateRepository({ pool, store })` returns appropriate implementation based on pool availability

### Knowledge Module Structure
- `packages/server/src/lib/knowledge.ts` is a single file (not a directory) containing:
  - `createKnowledgeEntryRecord()` - creates new entry with ID from `store.nextId(data, 'knowledge')`
  - `resubmitKnowledgeEntry()` - modifies entry in place
  - `applyReviewDecision()` - applies review decision, calls `transitionLifecycleState()`
  - `updateKnowledgeEntry()` - privileged update
  - `toKnowledgeEntry()` - converts record to domain type

### Index Tables
- `knowledge_embeddings` and `knowledge_keywords` tables already exist
- Both have `entry_id` column referencing knowledge entries
- No foreign key constraint (allows JSONB-based entries during migration)

### Routes Using Knowledge Mutations
- `packages/server/src/routes/knowledge.ts` - create, resubmit, update knowledge
- `packages/server/src/routes/traps.ts` - create, resubmit traps (subset of knowledge)
- `packages/server/src/routes/review.ts` - apply review decisions

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
