---
wave: 1
depends_on: []
files_modified:
  - packages/contracts/src/domain/candidates.ts
  - packages/contracts/src/index.ts
autonomous: true
---

# Plan 34-01: Add Duplicate Job Bundle and Manual Result Types

## Objective

Add domain types for duplicate job bundle response and manual result submission to contracts package.

## Context

Phase 33 established `CandidateSubmission` and `DuplicateCase` types. Phase 34 needs additional types for:
1. Full job bundle response (including matched entity data for offline review)
2. Manual result submission schema (for reviewer decisions)

## Tasks

### Task 1: Add manual result submission types

<read_first>
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- `ManualResultDecisionSchema` enum with 'independent' and 'merged' values exists
- `ManualResultSubmissionSchema` with candidateId, decision, notes, and optional mergedWith fields exists
- `ManualResultResponseSchema` with candidateId, decision, reviewedAt, reviewedBy, and nextState fields exists
- Type exports exist for all new schemas
</acceptance_criteria>

<action>
Add to `packages/contracts/src/domain/candidates.ts`:

```typescript
/**
 * Manual resolution decision for a duplicate case.
 * 'independent' means candidate is distinct and should proceed.
 * 'merged' means candidate should be rejected/merged into existing entity.
 */
export const ManualResultDecisionSchema = z.enum(['independent', 'merged']);

/**
 * Reference to the existing entity for merged decisions.
 */
export const MergedWithReferenceSchema = z.object({
  entityType: z.enum(['trap', 'skill']),
  entityId: entityIdSchema,
  entityTitle: z.string().min(1).max(280).optional(),
});

/**
 * Manual result submission from reviewer.
 * Stored on candidate record for Phase 35 processing.
 */
export const ManualResultSubmissionSchema = z.object({
  decision: ManualResultDecisionSchema,
  notes: z.string().min(1).max(1000),
  mergedWith: MergedWithReferenceSchema.optional(),
});

/**
 * Response after submitting manual result.
 */
export const manualResultResponseSchema = z.object({
  candidateId: entityIdSchema,
  decision: ManualResultDecisionSchema,
  reviewedAt: isoTimestampSchema,
  reviewedBy: entityIdSchema,
  nextState: z.enum(['duplicate_detected', 'ready_for_review', 'rejected']),
});

// Type exports
export type ManualResultDecision = z.infer<typeof ManualResultDecisionSchema>;
export type MergedWithReference = z.infer<typeof MergedWithReferenceSchema>;
export type ManualResultSubmission = z.infer<typeof ManualResultSubmissionSchema>;
export type ManualResultResponse = z.infer<typeof manualResultResponseSchema>;
```

</action>

### Task 2: Add duplicate job bundle response types

<read_first>
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- `DuplicateJobBundleResponseSchema` exists with candidate, originalPayload, analysisSnapshot, matches, and expectedResultSchema fields
- `DuplicateJobMatchEntitySchema` exists for matched entity data (trap or skill)
- Type exports exist for all new schemas
</acceptance_criteria>

<action>
Add to `packages/contracts/src/domain/candidates.ts`:

```typescript
/**
 * Matched entity data included in bundle for offline review.
 * Contains enough data for reviewer to make merge decision.
 */
export const DuplicateJobMatchEntitySchema = z.object({
  entityType: z.enum(['trap', 'skill']),
  entityId: entityIdSchema,
  title: z.string().min(1).max(280),
  // For traps
  shortcut: z.string().optional(),
  detail: z.string().optional(),
  labels: z.array(labelSchema).optional(),
  scope: scopeSchema.optional(),
  requiredLevel: securityLevelSchema.optional(),
  // For skills - include slug and file metadata
  slug: z.string().optional(),
  files: z.array(SkillBundleFileMetadataSchema).optional(),
});

/**
 * Full match entry in bundle with match metadata and entity data.
 */
export const DuplicateJobMatchEntrySchema = z.object({
  match: DuplicateMatchSchema,
  entity: DuplicateJobMatchEntitySchema,
});

/**
 * Expected result schema reference for manual submission.
 */
export const ExpectedManualResultSchemaSchema = z.object({
  description: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean(),
    description: z.string(),
  })),
});

/**
 * Full duplicate job bundle for offline review.
 * Contains all data needed to make and submit a manual decision.
 */
export const DuplicateJobBundleResponseSchema = z.object({
  candidate: z.object({
    id: entityIdSchema,
    sourceType: CandidateSourceSchema,
    status: CandidateStatusSchema,
    receivedAt: isoTimestampSchema,
    submittedBy: entityIdSchema,
  }),
  originalPayload: CandidatePayloadSchema,
  analysisSnapshot: AnalysisSnapshotSchema.nullable(),
  matches: z.array(DuplicateJobMatchEntrySchema),
  expectedResultSchema: ExpectedManualResultSchemaSchema,
});

// Type exports
export type DuplicateJobMatchEntity = z.infer<typeof DuplicateJobMatchEntitySchema>;
export type DuplicateJobMatchEntry = z.infer<typeof DuplicateJobMatchEntrySchema>;
export type ExpectedManualResultSchema = z.infer<typeof ExpectedManualResultSchemaSchema>;
export type DuplicateJobBundleResponse = z.infer<typeof DuplicateJobBundleResponseSchema>;
```

</action>

### Task 3: Verify contracts export all new types

<read_first>
- packages/contracts/src/index.ts
</read_first>

<acceptance_criteria>
- `packages/contracts/src/index.ts` has `export * from './domain/candidates.js';`
- TypeScript compilation succeeds with no errors
</acceptance_criteria>

<action>
The existing `export * from './domain/candidates.js';` line in `packages/contracts/src/index.ts` will automatically export all new types. Run `pnpm --filter @trapmap/contracts build` to verify compilation succeeds.

</action>

## Verification

```bash
# Verify types are exported
pnpm --filter @trapmap/contracts build
grep -c "ManualResultSubmissionSchema\|DuplicateJobBundleResponseSchema" packages/contracts/src/domain/candidates.ts
```

## Files Modified

- `packages/contracts/src/domain/candidates.ts` - Added manual result and bundle response types
- `packages/contracts/src/index.ts` - Exports new types via existing wildcard export
