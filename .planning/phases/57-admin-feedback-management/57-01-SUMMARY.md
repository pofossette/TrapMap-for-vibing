---
phase: "57"
plan: "01"
subsystem: feedback
tags: [contracts, schema, feedback, admin, batch, quality-score]
dependency_graph:
  requires: [phase-56-feedback-submission]
  provides: [feedback-list-contracts, feedback-batch-contracts, quality-score-schema, lifecycle-trigger-rules]
  affects: [packages/contracts]
tech_stack:
  added: [zod-preprocess-multi-filter, feedback-quality-score, lifecycle-trigger-rules]
  patterns: [comma-separated-filter-preprocess, batch-action-preview, quality-breakdown]
key_files:
  created: []
  modified:
    - packages/contracts/src/domain/feedback.ts
decisions:
  - Combined Tasks 1-3 into single commit (same file, sequential additions)
  - Task 4 requires no index.ts changes (existing export * covers all new exports)
metrics:
  duration: "4m"
  completed: "2026-05-03"
  tasks: 4
  files: 1
---

# Phase 57 Plan 01: Feedback Batch Contracts and Quality Score Schema Summary

Extended feedback domain schemas with admin-facing list/batch request/response schemas and quality score computation schema.

## Tasks Completed

| Task | Name | Commit | Files |
| ----- | ---- | ------ | ----- |
| 1 | Quality Score and Lifecycle Trigger Schemas | 5db9af6 | packages/contracts/src/domain/feedback.ts |
| 2 | Feedback List Request/Response Schemas | 5db9af6 | packages/contracts/src/domain/feedback.ts |
| 3 | Feedback Batch Action Schemas | 5db9af6 | packages/contracts/src/domain/feedback.ts |
| 4 | Export New Types from contracts/index.ts | n/a | No changes needed (existing export * covers all) |

## What Was Built

### Quality Score Schema (FEEDBACK-03)
- `feedbackQualityBreakdownSchema`: Counts by problem type (incorrect, outdated, contextMismatch, incomplete, other)
- `feedbackQualityScoreSchema`: Composite score with entryId, score (0-100), breakdown, totalFeedback, computedAt
- `lifecycleTriggerRuleSchema`: Rule mapping problemType + minCount within timeWindowDays to targetDecayState
- `DEFAULT_LIFECYCLE_TRIGGER_RULES`: 3 default rules (outdated->stale, incorrect->review-due, context-mismatch->review-due)

### Feedback List Schemas (FEEDBACK-02)
- `feedbackListRequestSchema`: Filters for status, problemType, entryId, entryType, age range, with comma-separated string preprocessing
- `feedbackListItemSchema`: Enriched item with entryShortcut, ageDays, submittedByHandle for admin display
- `feedbackListResponseSchema`: Paginated response with optional qualityScore when filtering by single entryId

### Feedback Batch Action Schemas (FEEDBACK-02)
- `feedbackBatchActionSchema`: 5 actions (resolve, dismiss, triage, request-info, transition)
- `feedbackBatchRequestSchema`: Batch request with dryRun preview and optional targetDecayState for transition action
- `feedbackBatchItemSchema`: Per-item result with eligibility, proposed changes, and resultingDecayState
- `feedbackBatchResponseSchema`: Batch response with eligible/ineligible counts and appliedAt timestamp

## Deviations from Plan

### Design Decisions

**1. Tasks 1-3 combined into single commit**
- **Reason:** All three tasks modify the same file (`feedback.ts`) with sequential additions. Splitting into separate commits would require complex git staging or temporary file manipulation for no practical benefit.
- **Impact:** All schema additions are in one commit (5db9af6). The commit message documents all three task areas.

**2. Task 4 required no file changes**
- **Reason:** `packages/contracts/src/index.ts` already has `export * from './domain/feedback.js'` which automatically re-exports all new schemas and types. Adding explicit named exports (as the plan suggested) would be redundant and create maintenance burden.
- **Impact:** All new exports are available via the existing wildcard re-export.

## Verification

- TypeScript compilation: Pre-existing errors only (missing node_modules in worktree, boundary import issue). No new errors introduced.
- Must-haves checklist: All 9 items verified programmatically.
- Export coverage: Confirmed via wildcard re-export in index.ts.

## Known Stubs

None -- all schemas are fully defined with complete field sets.

## Threat Flags

No new threat surface introduced. This plan defines Zod schemas only (data validation contracts). No network endpoints, auth paths, or runtime behavior created.
