---
wave: 2
depends_on:
  - 34-01
files_modified:
  - packages/server/src/lib/candidates/store.ts
  - packages/contracts/src/domain/candidates.ts
autonomous: true
---

# Plan 34-02: Add Manual Result Store Functions

## Objective

Add store functions to attach and retrieve manual results on candidate submissions.

## Context

Plan 34-01 defined `ManualResultSubmission` type. Now we need store functions to persist manual results on candidate records. The manual result is stored on the candidate itself (not a separate collection) to allow correction before Phase 35 processing.

## Tasks

### Task 1: Add store function to attach manual result

<read_first>
- packages/server/src/lib/candidates/store.ts
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- `attachManualResult` function exists in store.ts
- Function validates candidate exists and is in `duplicate_detected` status
- Function stores manual result with timestamp and reviewer ID
- Function returns updated candidate
</acceptance_criteria>

<action>
Add to `packages/server/src/lib/candidates/store.ts`:

```typescript
import type { ManualResultSubmission } from '@trapmap/contracts';

/**
 * Manual result record stored on candidate.
 * Captures reviewer decision and allows correction before Phase 35 processing.
 */
export interface ManualResultRecord extends ManualResultSubmission {
  submittedAt: string;
  submittedBy: string;
}

/**
 * Attach manual result to candidate.
 * Only candidates in 'duplicate_detected' status can receive manual results.
 */
export function attachManualResult(args: {
  data: StoreData;
  candidateId: string;
  result: ManualResultSubmission;
  reviewedBy: string;
}): { candidate: CandidateSubmission; previousResult: ManualResultRecord | null } {
  const candidate = args.data.candidateSubmissions.find(c => c.id === args.candidateId);

  if (!candidate) {
    throw new Error(`Candidate ${args.candidateId} not found`);
  }

  if (candidate.status !== 'duplicate_detected') {
    throw new Error(`Candidate ${args.candidateId} is not in duplicate_detected status (current: ${candidate.status})`);
  }

  const previousResult = (candidate as any).manualResult ?? null;

  const manualResult: ManualResultRecord = {
    ...args.result,
    submittedAt: nowIso(),
    submittedBy: args.reviewedBy,
  };

  // Store on candidate (allow correction)
  (candidate as any).manualResult = manualResult;

  return { candidate, previousResult };
}

/**
 * Get manual result from candidate.
 */
export function getManualResult(data: StoreData, candidateId: string): ManualResultRecord | null {
  const candidate = data.candidateSubmissions.find(c => c.id === candidateId);
  if (!candidate) {
    return null;
  }
  return (candidate as any).manualResult ?? null;
}
```

</action>

### Task 2: Extend candidate type to include manual result field

<read_first>
- packages/contracts/src/domain/candidates.ts
</read_first>

<acceptance_criteria>
- `CandidateSubmissionSchema` includes optional `manualResult` field
- Field is nullable to allow candidates without manual results
</acceptance_criteria>

<action>
Extend `CandidateSubmissionSchema` in `packages/contracts/src/domain/candidates.ts` to include:

```typescript
// Add to CandidateSubmissionSchema:
manualResult: z.object({
  decision: ManualResultDecisionSchema,
  notes: z.string().min(1).max(1000),
  mergedWith: MergedWithReferenceSchema.optional(),
  submittedAt: isoTimestampSchema,
  submittedBy: entityIdSchema,
}).nullable(),
```

This allows the manual result to be stored directly on the candidate record.

</action>

### Task 3: Verify store functions compile

<read_first>
- packages/server/src/lib/candidates/store.ts
</read_first>

<acceptance_criteria>
- TypeScript compilation succeeds for server package
- `attachManualResult` and `getManualResult` are exported from store.ts
</acceptance_criteria>

<action>
Run `pnpm --filter @trapmap/server build` to verify compilation succeeds. The functions will be used by routes in subsequent plans.

</action>

## Verification

```bash
# Verify functions exist
grep -c "attachManualResult\|getManualResult" packages/server/src/lib/candidates/store.ts
# Build succeeds
pnpm --filter @trapmap/server build
```

## Files Modified

- `packages/server/src/lib/candidates/store.ts` - Added manual result store functions
- `packages/contracts/src/domain/candidates.ts` - Extended CandidateSubmissionSchema with manualResult field