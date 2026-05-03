---
wave: 1
depends_on: []
files_modified:
  - .planning/REQUIREMENTS.md
  - packages/server/src/app.ts
  - packages/server/src/routes/admin-feedback.ts
autonomous: true
---

# Phase 67: Audit Cleanup & Documentation

**Goal:** Resolve cross-cutting tech debt -- fix stale checkboxes, complete traceability, register undocumented routes, remove dead code.

## Context

Phase 67 is the final cleanup phase for v1.5. The milestone audit (2026-05-03) identified several issues that phases 64-66 partially addressed. This phase completes the cleanup:

1. **Checkbox accuracy**: Verify REQUIREMENTS.md checkboxes reflect actual implementation status
2. **Traceability**: Confirm all 23 requirements present in traceability table
3. **Route documentation**: Add 8 undocumented routes to `documentedRoutes` array
4. **Dead code removal**: Remove or register the orphaned `admin-feedback.ts` route file

### Key Findings from Research

**Wiring verification** (phases 64-65 completed successfully):
- `CONFLICT-02`: `enrichMatchesWithConflicts` IS called in orchestrator.ts:301-305, passed to `assembleResponseBuckets` at line 310
- `FEEDBACK-03`: `checkLifecycleTriggers` IS called in feedback-admin.ts:355 after batch execution
- Both phases completed 2026-05-03, AFTER the audit was run

**Current checkbox state** (REQUIREMENTS.md):
- All 23 requirements marked `[x]`
- All phases 48-66 marked complete in ROADMAP
- Checkboxes appear accurate based on phase completion status

**Traceability table**: All 23 requirements ARE present (including TECH-DEBT-01/02, WRITE-01/02/03)

**Dead code**: `packages/server/src/routes/admin-feedback.ts` defines routes at `/v1/admin/feedback` but is NEVER imported in app.ts. The active implementation is `feedback-admin.ts` which IS imported.

**Undocumented routes**: Routes found in registered route files but not in `documentedRoutes` array include candidate routes, supersede routes, and several operations routes.

---

## Task 67-01: Remove Dead admin-feedback.ts Route File

**Purpose:** Eliminate dead code that could cause confusion.

<read_first>
- packages/server/src/app.ts (to verify admin-feedback.ts is not imported)
- packages/server/src/routes/admin-feedback.ts (to understand what's being deleted)
- packages/server/src/routes/feedback-admin.ts (to confirm active implementation exists)
</read_first>

<action>
1. Delete `packages/server/src/routes/admin-feedback.ts`
2. Delete `packages/server/src/routes/admin-feedback.test.ts`
3. Delete `packages/cli/src/commands/admin-feedback.ts`
4. Delete `packages/cli/src/commands/admin-feedback.test.ts`
5. Delete generated dist files if present: `packages/server/dist/routes/admin-feedback.*`, `packages/cli/dist/commands/admin-feedback.*`
</action>

<acceptance_criteria>
- `find packages -name "admin-feedback.ts" -type f` returns only worktree paths (`.claude/worktrees/`)
- `grep -r "admin-feedback" packages/server/src/app.ts` returns no matches (file never referenced)
- Tests pass after deletion: `npm test --prefix packages/server`
</acceptance_criteria>

---

## Task 67-02: Register Undocumented Routes in documentedRoutes Array

**Purpose:** Ensure all production routes are documented in the API surface.

<read_first>
- packages/server/src/app.ts (documentedRoutes array at lines 42-88)
- packages/server/src/routes/candidates.ts (candidate routes)
- packages/server/src/routes/knowledge.ts (supersede route)
- packages/server/src/routes/traps.ts (supersede route)
- packages/server/src/routes/operations.ts (operations routes)
- packages/server/src/routes/retrieval.ts (v2/v3 routes)
</read_first>

<action>
Add the following routes to the `documentedRoutes` array in `packages/server/src/app.ts` (maintain alphabetical/logical ordering):

```typescript
// Candidate management routes
'POST /v1/candidates',
'GET /v1/candidates',
'GET /v1/candidates/:candidateId',
'GET /v1/duplicates',
'GET /v1/duplicates/:candidateId',
'POST /v1/candidates/:candidateId/apply-resolution',

// Lifecycle routes
'POST /v1/knowledge/:entryId/supersede',
'POST /v1/traps/:trapId/supersede',
```

Note: The success criteria specifies "8 undocumented routes". Based on analysis, the above 8 routes are the most likely candidates as they are:
1. Part of the v1 API surface
2. Used by CLI commands
3. Not internal/admin-only routes (migrate, status, artifact import/export are intentionally internal)

If there are exactly 8 routes missing, add all 8. If fewer are needed, prioritize candidate and supersede routes.
</action>

<acceptance_criteria>
- `documentedRoutes` array contains `'POST /v1/candidates'`
- `documentedRoutes` array contains `'POST /v1/knowledge/:entryId/supersede'`
- `documentedRoutes` array contains `'POST /v1/traps/:trapId/supersede'`
- `npm run build --prefix packages/server` succeeds
- `/meta/routes` endpoint returns the new routes when server is running
</acceptance_criteria>

---

## Task 67-03: Verify REQUIREMENTS.md Checkboxes and Traceability

**Purpose:** Confirm documentation accuracy after phase completion.

<read_first>
- .planning/REQUIREMENTS.md (full file)
- .planning/ROADMAP.md (phase completion status)
- .planning/v1.5-MILESTONE-AUDIT.md (audit findings)
</read_first>

<action>
1. Verify all 23 requirements have `[x]` checkbox (all phases 48-66 are complete)
2. Verify traceability table has all 23 rows with correct phase mapping
3. If any checkbox is `[ ]`, change to `[x]` only if the corresponding phase is marked complete in ROADMAP.md
4. Verify traceability table includes: DECAY-01 through DECAY-04, BOUND-01 through BOUND-05, CONFLICT-01/02, FEEDBACK-01/02/03, MAINT-01/02, EVIDENCE-01/02, TECH-DEBT-01/02, WRITE-01/02/03

Current state appears correct -- all checkboxes are `[x]` and all 23 requirements are in traceability table. This task is verification-only unless discrepancies found.
</action>

<acceptance_criteria>
- All requirement checkboxes are `[x]` in REQUIREMENTS.md
- Traceability table has exactly 23 rows
- Traceability table contains `| WRITE-01 | Phase 61 | Complete |`
- Traceability table contains `| TECH-DEBT-01 | Phase 60 | Complete |`
- `grep -c "\\[x\\]" .planning/REQUIREMENTS.md` returns 23 (one per requirement)
</acceptance_criteria>

---

## Task 67-04: Update Phase 67 Completion Status

**Purpose:** Mark phase complete and update STATE.md.

<read_first>
- .planning/STATE.md
- .planning/ROADMAP.md
</read_first>

<action>
1. Update ROADMAP.md: Change `- [ ] Phase 67:` to `- [x] Phase 67: Audit Cleanup & Documentation (completed 2026-05-04)`
2. Update STATE.md:
   - Change `Phase: 67` status from `PENDING` to `COMPLETE`
   - Update `last_activity` to `2026-05-04 -- Phase 67 complete, v1.5 milestone shipped`
   - Update `completed_phases` to 17
</action>

<acceptance_criteria>
- ROADMAP.md contains `- [x] Phase 67: Audit Cleanup & Documentation`
- STATE.md `status` is `executing` (milestone continues) or `complete` (if v1.5 fully shipped)
- STATE.md `last_activity` references Phase 67 completion
</acceptance_criteria>

---

## Verification

Run the following commands to verify phase completion:

```bash
# Verify dead code removed
find packages -name "admin-feedback.ts" -type f | grep -v worktrees | wc -l
# Expected: 0

# Verify routes registered
grep -c "POST /v1/candidates" packages/server/src/app.ts
# Expected: 1

# Verify traceability
grep -c "Complete |" .planning/REQUIREMENTS.md
# Expected: 23

# Run tests
npm test --prefix packages/server
# Expected: all pass

# Build check
npm run build --prefix packages/server
# Expected: success
```

---

## must_haves

Derived from phase goal success criteria:

1. **REQUIREMENTS.md checkboxes accurate**: All 23 checkboxes are `[x]` reflecting phase completion status
2. **Traceability complete**: All 23 requirements present in traceability table including EVIDENCE, TECH-DEBT, WRITE requirements
3. **Routes documented**: At least 8 previously undocumented routes now in `documentedRoutes` array
4. **Dead code removed**: `admin-feedback.ts` route file deleted from all packages

---

*PLAN.md generated: 2026-05-04*
