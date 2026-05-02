# Phase 55: Conflict Detection & Display - Pattern Mapping

**Generated:** 2026-05-03
**Phase:** 55 - Conflict Detection & Display

## Files to Create/Modify

| File | Role | Data Flow | Status |
|------|------|-----------|--------|
| `packages/contracts/src/domain/conflict.ts` | Schema Definition | Defines conflict types and records for storage/retrieval | NEW |
| `packages/contracts/src/domain/conflict.test.ts` | Schema Tests | Validates conflict schemas independently | NEW |
| `packages/contracts/src/index.ts` | Export Index | Re-exports conflict types to consumers | MODIFY |
| `packages/server/src/lib/conflict/detect.ts` | Detection Algorithm | Compares entries on approval, outputs ConflictRecord[] | NEW |
| `packages/server/src/lib/conflict/detect.test.ts` | Detection Tests | Unit tests for conflict detection algorithm | NEW |
| `packages/server/src/lib/conflict/enrich.ts` | Retrieval Enrichment | Reads conflicts from store, attaches to retrieval matches | NEW |
| `packages/server/src/lib/conflict/enrich.test.ts` | Enrichment Tests | Unit tests for conflict enrichment | NEW |
| `packages/server/src/lib/store.ts` | Data Store | Adds `conflicts` array to StoreData | MODIFY |
| `packages/server/src/routes/review.ts` | Approval Hook | Triggers conflict detection post-approval | MODIFY |
| `packages/cli/src/commands/retrieval.ts` | CLI Display | Formats conflicts in terminal output | MODIFY |
| `packages/contracts/src/domain/retrieval.ts` | Retrieval Schema | Adds `conflicts` field to match schemas | MODIFY |

---

## File: `packages/contracts/src/domain/conflict.ts`

**Role:** Schema Definition
**Data Flow:** Defines conflict types and records for storage/retrieval

### Closest Existing Analog: `packages/contracts/src/domain/feedback.ts`

Feedback follows the same pattern: an enum for categorization, a full record schema for storage, and a compact hint schema for retrieval responses.

### Pattern Excerpts from `feedback.ts`:

```typescript
// Line 1-16: Enum with controlled vocabulary
import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema, actorRefSchema } from './common.js';

/**
 * Problem type enum for feedback categorization.
 * Ensures consistent categorization across all feedback submissions.
 */
export const feedbackProblemTypeSchema = z.enum([
  'incorrect',       // Solution is wrong or has errors
  'outdated',        // Information is stale or no longer applies
  'context-mismatch', // Doesn't apply to current situation
  'incomplete',      // Missing critical information
  'other',           // Catch-all for uncategorized feedback
]);
```

```typescript
// Line 58-73: Full record schema extending submission schema
export const feedbackRecordSchema = feedbackSubmissionSchema.extend({
  /** Unique feedback record identifier */
  id: entityIdSchema,
  /** When the feedback was submitted */
  submittedAt: isoTimestampSchema,
  /** User who submitted the feedback */
  submittedBy: actorRefSchema,
  /** Current processing status */
  status: feedbackStatusSchema,
  /** Admin notes added during review (Phase 57) */
  adminNotes: z.string().max(1000).optional(),
});
```

```typescript
// Line 82-88: Type exports
export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
export type FeedbackCustomAnswer = z.infer<typeof feedbackCustomAnswerSchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
```

### Key Pattern Elements:

1. **Enum schema for categorization**: `z.enum()` with JSDoc comments per value
2. **Record schema with id/timestamp fields**: Uses `entityIdSchema`, `isoTimestampSchema`
3. **Type exports**: Infer types from schemas using `z.infer<typeof schema>`
4. **Imports from common**: `entityIdSchema`, `isoTimestampSchema`, `actorRefSchema`

---

## File: `packages/contracts/src/domain/conflict.test.ts`

**Role:** Schema Tests
**Data Flow:** Validates conflict schemas independently

### Closest Existing Analog: `packages/contracts/src/domain/feedback.test.ts`

Tests enum acceptance/rejection, full record validation, and required field enforcement.

### Pattern Excerpts from `feedback.test.ts`:

```typescript
// Line 1-8: Imports and describe block
import { describe, expect, it } from 'vitest';

import {
  feedbackProblemTypeSchema,
  feedbackSubmissionSchema,
  feedbackRecordSchema,
} from './feedback.js';

describe('feedback schema', () => {
```

```typescript
// Line 10-22: Enum tests
describe('feedbackProblemTypeSchema', () => {
  it('accepts all valid problem types', () => {
    const validTypes = ['incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other'];
    for (const type of validTypes) {
      expect(feedbackProblemTypeSchema.parse(type)).toBe(type);
    }
  });

  it('rejects invalid problem type strings', () => {
    expect(() => feedbackProblemTypeSchema.parse('invalid-type')).toThrow();
    expect(() => feedbackProblemTypeSchema.parse('')).toThrow();
  });
});
```

```typescript
// Line 24-39: Submission schema tests with required fields
describe('feedbackSubmissionSchema', () => {
  const validSubmission = {
    entryId: 'entry-123',
    entryType: 'trap' as const,
    problemType: 'incorrect' as const,
    description: 'This solution has an error in the code example.',
  };

  it('accepts valid submission with required fields', () => {
    const result = feedbackSubmissionSchema.parse(validSubmission);
    expect(result.entryId).toBe('entry-123');
    expect(result.entryType).toBe('trap');
    expect(result.problemType).toBe('incorrect');
    expect(result.description).toBe('This solution has an error in the code example.');
  });
```

### Key Pattern Elements:

1. **Vitest imports**: `describe, expect, it` from 'vitest'
2. **Nested describe blocks**: One per schema under test
3. **Enum tests**: Accept valid values, reject invalid strings
4. **Record tests**: Required fields, optional fields, validation bounds
5. **Reference valid object**: Define once, spread for variations

---

## File: `packages/server/src/lib/conflict/detect.ts`

**Role:** Detection Algorithm
**Data Flow:** Compares entries on approval, outputs ConflictRecord[]

### Closest Existing Analog: `packages/server/src/lib/pre-review.ts`

Pre-review already implements token-overlap scoring for duplicate detection. Conflict detection reuses this pattern but compares problem vs solution dimensions separately.

### Pattern Excerpts from `pre-review.ts`:

```typescript
// Line 16-39: Tokenization and overlap scoring
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }

  return shared / new Set([...a, ...b]).size;
}
```

```typescript
// Line 41-51: Threshold-based classification
function toRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.72) {
    return 'high';
  }

  if (score >= 0.38) {
    return 'medium';
  }

  return 'low';
}
```

```typescript
// Line 83-109: Main chain invocation comparing against existing entries
const preReviewChain = RunnableLambda.from(
  async (input: PreReviewInput): Promise<AgentReviewResult> => {
    const submissionDocument = new Document({
      pageContent: `${input.submission.shortcut}\n${input.submission.detail}`,
      metadata: {
        labels: input.submission.labels,
        scope: input.submission.scope,
      },
    });

    const submissionTokens = tokenize(submissionDocument.pageContent);
    let duplicateScore = 0;

    for (const entry of input.existingEntries) {
      const candidate = new Document({
        pageContent: `${entry.shortcut}\n${entry.detail}`,
        metadata: {
          scope: entry.scope,
          teamId: entry.teamId,
        },
      });

      duplicateScore = Math.max(
        duplicateScore,
        overlapScore(submissionTokens, tokenize(candidate.pageContent)),
      );
    }
```

### Key Pattern Elements:

1. **Tokenize function**: Lowercase, split on non-alphanumeric, filter short tokens
2. **Overlap score**: Jaccard similarity (intersection / union)
3. **Threshold constants**: Numeric thresholds for classification
4. **Iterate over existing entries**: Compare new entry against all approved entries
5. **Separate problem vs solution scoring**: NEW - compare shortcut (problem) and detail (solution) separately

---

## File: `packages/server/src/lib/conflict/enrich.ts`

**Role:** Retrieval Enrichment
**Data Flow:** Reads conflicts from store, attaches to retrieval matches

### Closest Existing Analog: `packages/server/src/lib/retrieval/assembly.ts`

Assembly module already builds retrieval matches with optional fields like `evidence`. Conflict enrichment follows the same pattern of attaching optional metadata.

### Pattern Excerpts from `assembly.ts`:

```typescript
// Line 61-73: Extract compact hint from full record
export function extractEvidenceHint(record: {
  evidenceMeta: { sourceType: EvidenceSourceType; evidenceLevel: EvidenceLevel; verifiedAt: string } | null;
}): EvidenceHint | null {
  if (!record.evidenceMeta) {
    return null;
  }
  return {
    evidenceLevel: record.evidenceMeta.evidenceLevel,
    verifiedAt: record.evidenceMeta.verifiedAt,
    sourceType: record.evidenceMeta.sourceType,
  };
}
```

```typescript
// Line 125-145: Attach optional field to match
export function toRetrievalMatch(
  scoredEntry: ScoredEntry,
  filters: RetrievalQuery['filters'],
  citation?: RetrievalCitation,
  decayMultiplier?: number,
): RetrievalMatch {
  const { entry, score } = scoredEntry;
  const evidence = extractEvidenceHint(entry);
  return retrievalMatchSchema.parse({
    entryId: entry.id,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    score,
    reason: generateMatchReason(entry, score, filters, decayMultiplier),
    citation,
    ...(evidence ? { evidence } : {}),
  });
}
```

### Key Pattern Elements:

1. **Build lookup map once**: O(n) to build Map from conflicts array
2. **Lookup conflicts by entryId**: O(1) per match
3. **Conditional field spread**: `...(conflicts ? { conflicts } : {})`
4. **Compact hint shape**: Exclude verbose fields (problemOverlapScore, solutionDiffScore)

---

## File: `packages/server/src/lib/store.ts`

**Role:** Data Store
**Data Flow:** Adds `conflicts` array to StoreData

### Closest Existing Analog: StoreData interface at line 637-660

The interface already has multiple additive array collections: `duplicateCases`, `feedbackQueue`, `candidateSubmissions`.

### Pattern Excerpts from `store.ts`:

```typescript
// Line 637-660: StoreData interface with additive collections
export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
  /** Additive skill artifacts collection (ARTF-02, T-12-05) */
  skillArtifacts: SkillArtifactRecord[];
  /** Additive file payload storage for imported artifacts (IMEX-04) */
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  /** Candidate submissions awaiting duplicate analysis */
  candidateSubmissions: CandidateSubmissionRecord[];
  /** Detected duplicate cases for manual review */
  duplicateCases: DuplicateCaseRecord[];
  /** Entity lineage records for tracking provenance */
  entityLineage: EntityLineageRecord[];
  /** Durable graph index documents for GraphRAG-lite (P36-04) */
  graphIndexDocuments: GraphIndexDocumentRecord[];
  /** Feedback queue for admin review (FEEDBACK-01) */
  feedbackQueue: FeedbackQueueItemRecord[];
}
```

```typescript
// Line 662-677: EMPTY_STORE with empty arrays
const EMPTY_STORE: StoreData = {
  counters: {},
  users: [],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
  candidateSubmissions: [],
  duplicateCases: [],
  entityLineage: [],
  graphIndexDocuments: [],
  feedbackQueue: [],
```

### Key Pattern Elements:

1. **Additive collection**: Add new array field with JSDoc comment
2. **Import type at top**: `import type { ConflictRecord } from '@trapmap/contracts'`
3. **EMPTY_STORE initialization**: Add `conflicts: []` to empty store
4. **Phase reference in JSDoc**: `(CONFLICT-01)` style annotation

---

## File: `packages/server/src/routes/review.ts`

**Role:** Approval Hook
**Data Flow:** Triggers conflict detection post-approval

### Closest Existing Analog: Post-commit indexing pattern at lines 166-186

The review route already has a post-commit hook pattern for triggering indexing. Conflict detection uses the same fire-and-forget pattern.

### Pattern Excerpts from `review.ts`:

```typescript
// Line 166-186: Post-commit hook pattern
// Trigger indexing AFTER the transaction commits (post-commit pattern)
// This prevents nested transactions and ensures the domain state is persisted
if (entryId && previousState && nextState && previousState !== nextState) {
  try {
    await runKnowledgeIndexEvent({
      services: {
        store: app.skillShareer.store,
        data: await app.skillShareer.store.snapshot(),
      },
      entryId,
      previousState,
      nextState,
      reason: `reviewer-${payload.decision}`,
      adapters: app.skillShareer.indexAdapters,
    });
  } catch (indexingError) {
    // Log but don't fail the request - domain state is already committed
    app.log.error({ indexingError, entryId }, 'Post-commit indexing failed');
    // Optionally: schedule retry or mark entry for reconciliation
  }
}
```

### Key Pattern Elements:

1. **Condition check**: `nextState === 'approved'` AND `previousState !== nextState`
2. **Fire-and-forget**: Wrap in try/catch, log errors, never fail the review response
3. **Pass services object**: `{ store, data }` for transaction access
4. **Fresh snapshot**: `await store.snapshot()` for latest data

---

## File: `packages/cli/src/commands/retrieval.ts`

**Role:** CLI Display
**Data Flow:** Formats conflicts in terminal output

### Closest Existing Analog: `formatMatch` and `formatCapsuleMatch` functions at lines 16-63

The CLI already formats retrieval matches with optional fields like citation. Conflict display follows the same pattern.

### Pattern Excerpts from `retrieval.ts`:

```typescript
// Line 16-32: Format match with optional citation
function formatMatch(match: RetrievalMatch): string {
  const lines = [
    `${match.entryId}`,
    `Shortcut: ${match.shortcut}`,
    `Labels: ${match.labels.join(', ')}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${match.reason}`,
  ];

  // Add citation information if available (hybrid/graph-assisted modes)
  if (match.citation?.recallChannels?.length) {
    lines.push(`Channels: ${match.citation.recallChannels.join(', ')}`);
    lines.push(`Source: ${match.citation.source.entryId} (${match.citation.source.scope})`);
  }

  return lines.join('\n');
}
```

```typescript
// Line 38-63: Format capsule match with structured output
function formatCapsuleMatch(capsule: {
  capsuleId: string;
  artifactId: string;
  situation: string;
  problem: string;
  goal: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
  score: number;
  reason: string;
}): string {
  const lines = [
    `${capsule.capsuleId}`,
    `Artifact: ${capsule.artifactId}`,
    `Situation: ${capsule.situation}`,
    `Problem: ${capsule.problem}`,
    `Goal: ${capsule.goal}`,
    `Labels: ${capsule.labels.join(', ')}`,
    `Scope: ${capsule.scope} (level ${capsule.requiredLevel})`,
    `Score: ${capsule.score.toFixed(2)}`,
    `Reason: ${capsule.reason}`,
  ];

  return lines.join('\n');
}
```

### Key Pattern Elements:

1. **Build lines array**: Each field on its own line
2. **Conditional sections**: `if (match.conflicts?.length)` for optional fields
3. **Conflict type indicator**: Prefix with icon or bracket like `[conflict: alternative]`
4. **Context string**: Include the conflict context for user decision-making

---

## File: `packages/contracts/src/domain/retrieval.ts`

**Role:** Retrieval Schema
**Data Flow:** Adds `conflicts` field to match schemas

### Closest Existing Analog: `retrievalMatchSchema` at lines 67-79 and `capsuleMatchSchema` at lines 102-133

Both schemas already have optional additive fields like `citation` and `evidence`. The `conflicts` field follows the same pattern.

### Pattern Excerpts from `retrieval.ts`:

```typescript
// Line 67-79: Retrieval match schema with optional fields
export const retrievalMatchSchema = z.object({
  entryId: entityIdSchema,
  scope: scopeSchema,
  requiredLevel: securityLevelSchema,
  shortcut: z.string(),
  detail: z.string(),
  labels: z.array(labelSchema),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  citation: retrievalCitationSchema.optional(),
  /** Compact evidence hint for retrieval responses */
  evidence: evidenceHintSchema.optional(),
});
```

```typescript
// Line 102-133: Capsule match schema with optional evidence
export const capsuleMatchSchema = z.object({
  /** Capsule identifier */
  capsuleId: entityIdSchema,
  /** Parent artifact identifier */
  artifactId: entityIdSchema,
  // ... other fields ...
  /** Compact evidence hint for retrieval responses */
  evidence: evidenceHintSchema.optional(),
});
```

### Key Pattern Elements:

1. **Optional field**: `conflicts: z.array(conflictHintSchema).optional()`
2. **JSDoc comment**: Describe the field purpose
3. **Compact hint type**: Use `conflictHintSchema` not full `conflictRelationSchema`
4. **Additive, not breaking**: `.optional()` ensures backward compatibility

---

## File: `packages/contracts/src/index.ts`

**Role:** Export Index
**Data Flow:** Re-exports conflict types to consumers

### Closest Existing Analog: Lines 1-20 showing export pattern

The index file re-exports all domain modules with `export * from` statements.

### Pattern Excerpts from `index.ts`:

```typescript
// Line 1-21: Export pattern
export * from './domain/artifacts.js';
export * from './domain/auth.js';
export * from './domain/boundary.js';
export * from './domain/candidates.js';
export * from './domain/common.js';
export * from './domain/decay.js';
export * from './domain/evidence.js';
export * from './domain/evals/retrieval.js';
export * from './domain/feedback.js';
export * from './domain/evals/report.js';
export * from './domain/evals/summary.js';
export * from './domain/feedback.js';
export * from './domain/knowledge.js';
export * from './domain/operations.js';
export * from './domain/path-validation.js';
export * from './domain/parsing.js';
export * from './domain/retrieval.js';
export * from './domain/review.js';
export * from './domain/plans.js';
export * from './domain/team.js';
```

### Key Pattern Elements:

1. **Add export line**: `export * from './domain/conflict.js';`
2. **Alphabetical ordering**: Insert after `candidates.js` or before `decay.js`
3. **No type-only exports**: Use regular `export *` unless specific re-export needed

---

## Summary: Pattern Consistency Checklist

| File | Follows Pattern From | Key Patterns Applied |
|------|---------------------|---------------------|
| `conflict.ts` | `feedback.ts` | Enum with JSDoc, record schema, type exports |
| `conflict.test.ts` | `feedback.test.ts` | Vitest, enum tests, record validation |
| `detect.ts` | `pre-review.ts` | tokenize(), overlapScore(), threshold constants |
| `enrich.ts` | `assembly.ts` | Build map once, conditional spread, compact hint |
| `store.ts` | existing StoreData | Additive array with JSDoc, EMPTY_STORE |
| `review.ts` | existing post-commit | Fire-and-forget, try/catch, condition check |
| `retrieval.ts` (CLI) | `formatMatch` | Lines array, conditional sections |
| `retrieval.ts` (contracts) | match schemas | Optional field, JSDoc comment |
| `index.ts` | existing exports | `export * from` line |
