---
wave: 0
depends_on: []
files_modified:
  - packages/contracts/src/domain/conflict.ts
  - packages/contracts/src/domain/conflict.test.ts
  - packages/contracts/src/domain/retrieval.ts
  - packages/contracts/src/index.ts
  - packages/server/src/lib/store.ts
  - packages/server/src/lib/conflict/detect.ts
  - packages/server/src/lib/conflict/detect.test.ts
  - packages/server/src/lib/conflict/enrich.ts
  - packages/server/src/lib/conflict/enrich.test.ts
  - packages/server/src/routes/review.ts
  - packages/cli/src/commands/retrieval.ts
autonomous: true
requirements:
  - CONFLICT-01
  - CONFLICT-02
---

# Phase 55: Conflict Detection & Display

**Goal:** Detect conflicting knowledge entries and display relationships in retrieval results so users can make informed choices between alternative solutions.

<threat_model>
### Attack Surface
- New `conflicts` array in StoreData persisted to disk
- Conflict detection triggered on approval (server-side only)
- Conflict hints exposed in retrieval API responses
- No new user input fields exposed (conflict detection uses existing entry content)

### Threats (STRIDE)
| Threat | STRIDE | Severity | Mitigation |
|--------|--------|----------|------------|
| Information disclosure via conflicts | Information Disclosure | medium | Conflict enrichment respects same governance filters as retrieval (team, requiredLevel) - users only see conflicts for entries they can access |
| Conflict flooding (gaming detection) | Denial of Service | low | Conflict detection runs server-side on approval only; no user-controlled trigger; algorithm uses fixed thresholds |
| N+1 query performance at retrieval | Denial of Service | low | Build Map from conflicts array once, O(1) lookup per match |

### ASVS L1 Controls Applied
- V4 Access Control: Conflict enrichment filters by team and requiredLevel using existing RBAC
- V5 Input Validation: All conflict data validated via Zod schemas before persistence
</threat_model>

---

## Plan Overview

| Plan | Wave | Description | Requirements |
|------|------|-------------|--------------|
| 55-01 | 0 | Conflict schema contracts and exports | CONFLICT-01 |
| 55-02 | 1 | Store data layer and detection algorithm | CONFLICT-01 |
| 55-03 | 2 | Retrieval enrichment and approval hook | CONFLICT-01, CONFLICT-02 |
| 55-04 | 3 | CLI display for conflict information | CONFLICT-02 |

---

## Plan 55-01: Conflict Schema Contracts

**Wave:** 0
**Requirements:** CONFLICT-01

### Task 55-01-01: Create conflict domain schemas

<read_first>
- packages/contracts/src/domain/feedback.ts (schema pattern reference)
- packages/contracts/src/domain/evidence.ts (hint pattern reference)
- packages/contracts/src/domain/common.ts (entityIdSchema, isoTimestampSchema)
- packages/contracts/src/domain/retrieval.ts (match schemas to extend)
- packages/contracts/src/index.ts (export pattern)
</read_first>

<action>
Create `packages/contracts/src/domain/conflict.ts` with:

1. **Conflict type enum:**
```typescript
export const conflictTypeSchema = z.enum([
  'alternative',     // Different valid approaches (e.g., REST vs GraphQL)
  'contradictory',   // Directly opposing solutions (e.g., "use X" vs "avoid X")
  'superseded',      // Newer entry replaces older approach
]);
```

2. **Conflict record schema for storage:**
```typescript
export const conflictRelationSchema = z.object({
  id: entityIdSchema,
  entryIdA: entityIdSchema,           // Lower entryId for canonical ordering
  entryIdB: entityIdSchema,           // Higher entryId
  conflictType: conflictTypeSchema,
  context: z.string().min(1).max(500),
  problemOverlapScore: z.number().min(0).max(1),
  solutionDiffScore: z.number().min(0).max(1),
  detectedAt: isoTimestampSchema,
});
```

3. **Conflict hint schema for retrieval responses (compact, excludes scores):**
```typescript
export const conflictHintSchema = z.object({
  entryId: entityIdSchema,
  shortcut: z.string(),
  conflictType: conflictTypeSchema,
  context: z.string(),
});
```

4. **Type exports:**
```typescript
export type ConflictType = z.infer<typeof conflictTypeSchema>;
export type ConflictRelation = z.infer<typeof conflictRelationSchema>;
export type ConflictHint = z.infer<typeof conflictHintSchema>;
```

5. Add JSDoc comments following the pattern from feedback.ts (enum values with inline comments, field descriptions).

6. Import from `./common.js`: `entityIdSchema`, `isoTimestampSchema`.
</action>

<acceptance_criteria>
- `packages/contracts/src/domain/conflict.ts` contains `conflictTypeSchema` with exactly 3 values: 'alternative', 'contradictory', 'superseded'
- `conflictRelationSchema` has all 7 fields: id, entryIdA, entryIdB, conflictType, context, problemOverlapScore, solutionDiffScore, detectedAt
- `conflictHintSchema` has exactly 4 fields: entryId, shortcut, conflictType, context
- File exports types: `ConflictType`, `ConflictRelation`, `ConflictHint`
- Command `pnpm test -- packages/contracts/src/domain/conflict.test.ts` exits 0 (after test file created)
</acceptance_criteria>

---

### Task 55-01-02: Create conflict schema tests

<read_first>
- packages/contracts/src/domain/conflict.ts (schemas to test)
- packages/contracts/src/domain/feedback.test.ts (test pattern reference)
</read_first>

<action>
Create `packages/contracts/src/domain/conflict.test.ts` with:

1. **Vitest imports:** `describe, expect, it` from 'vitest'

2. **Enum tests for conflictTypeSchema:**
   - Accepts 'alternative', 'contradictory', 'superseded'
   - Rejects invalid strings like 'invalid-type', ''

3. **ConflictRelation schema tests:**
   - Valid record with all required fields
   - Rejects missing required fields (id, entryIdA, entryIdB, conflictType, context, detectedAt)
   - Validates problemOverlapScore and solutionDiffScore are 0-1
   - Validates context max length 500

4. **ConflictHint schema tests:**
   - Valid hint with all fields
   - Compact form excludes scores
</action>

<acceptance_criteria>
- Test file has `describe('conflict schema', () => {...})` block
- `describe('conflictTypeSchema', ...)` tests all 3 valid enum values
- `describe('conflictRelationSchema', ...)` tests valid record and rejects missing fields
- `describe('conflictHintSchema', ...)` tests valid hint
- Command `pnpm test -- packages/contracts/src/domain/conflict.test.ts` exits 0
</acceptance_criteria>

---

### Task 55-01-03: Extend retrieval match schemas with conflicts field

<read_first>
- packages/contracts/src/domain/retrieval.ts (retrievalMatchSchema, capsuleMatchSchema)
- packages/contracts/src/domain/conflict.ts (conflictHintSchema)
- packages/contracts/src/domain/evidence.ts (pattern for optional additive fields)
</read_first>

<action>
Modify `packages/contracts/src/domain/retrieval.ts`:

1. Add import at top:
```typescript
import { conflictHintSchema } from './conflict.js';
```

2. Add to `retrievalMatchSchema` (after `evidence` field, around line 78):
```typescript
/** Conflict hints showing related entries with different solutions */
conflicts: z.array(conflictHintSchema).optional(),
```

3. Add to `capsuleMatchSchema` (after `evidence` field, around line 132):
```typescript
/** Conflict hints showing related entries with different solutions */
conflicts: z.array(conflictHintSchema).optional(),
```

4. Ensure import is added to existing import block from `./common.js`, `./evidence.js`, etc.
</action>

<acceptance_criteria>
- `retrievalMatchSchema` has `conflicts: z.array(conflictHintSchema).optional()` field
- `capsuleMatchSchema` has `conflicts: z.array(conflictHintSchema).optional()` field
- File imports `conflictHintSchema` from `./conflict.js`
- Command `pnpm test -- packages/contracts/src/domain/retrieval.test.ts` exits 0 (if test file exists) OR `pnpm build -- packages/contracts` exits 0
</acceptance_criteria>

---

### Task 55-01-04: Export conflict types from contracts index

<read_first>
- packages/contracts/src/index.ts (export pattern)
- packages/contracts/src/domain/conflict.ts (types to export)
</read_first>

<action>
Modify `packages/contracts/src/index.ts`:

Add export line after `export * from './domain/candidates.js';` (alphabetically after candidates, before decay):
```typescript
export * from './domain/conflict.js';
```
</action>

<acceptance_criteria>
- File contains `export * from './domain/conflict.js';`
- Export line is alphabetically ordered (after candidates.js, before or near decay.js)
- Command `pnpm build -- packages/contracts` exits 0
</acceptance_criteria>

---

## Plan 55-02: Store Data Layer and Detection Algorithm

**Wave:** 1
**Requirements:** CONFLICT-01
**Depends on:** Plan 55-01 (conflict schemas must exist)

### Task 55-02-01: Add conflicts array to StoreData

<read_first>
- packages/server/src/lib/store.ts (StoreData interface, EMPTY_STORE)
- packages/contracts/src/domain/conflict.ts (ConflictRelation type)
</read_first>

<action>
Modify `packages/server/src/lib/store.ts`:

1. Add import at top (in the type imports section):
```typescript
import type { ConflictRelation } from '@trapmap/contracts';
```

2. Add to `StoreData` interface (after `feedbackQueue`, around line 659):
```typescript
/** Detected conflict relationships between knowledge entries (CONFLICT-01) */
conflicts: ConflictRelation[];
```

3. Add to `EMPTY_STORE` object (after `feedbackQueue: []`, around line 677):
```typescript
conflicts: [],
```
</action>

<acceptance_criteria>
- `StoreData` interface has `conflicts: ConflictRelation[]` field with JSDoc comment
- `EMPTY_STORE` has `conflicts: []`
- Import statement includes `ConflictRelation` type from `@trapmap/contracts`
- Command `pnpm typecheck` exits 0
</acceptance_criteria>

---

### Task 55-02-02: Create conflict detection algorithm

<read_first>
- packages/server/src/lib/pre-review.ts (tokenize, overlapScore patterns)
- packages/server/src/lib/store.ts (KnowledgeRecord type, nowIso)
- packages/contracts/src/domain/conflict.ts (conflictRelationSchema, conflictTypeSchema)
</read_first>

<action>
Create `packages/server/src/lib/conflict/detect.ts`:

1. **Threshold constants (tunable):**
```typescript
/** Minimum problem overlap to consider entries as addressing the same problem */
const PROBLEM_OVERLAP_THRESHOLD = 0.5;
/** Minimum solution difference to consider entries as conflicting */
const SOLUTION_DIFF_THRESHOLD = 0.3;
/** High solution difference threshold for "contradictory" classification */
const CONTRADICTORY_THRESHOLD = 0.8;
/** Medium solution difference threshold for "alternative" classification */
const ALTERNATIVE_THRESHOLD = 0.4;
```

2. **Tokenize function (copy from pre-review.ts):**
```typescript
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}
```

3. **Overlap score function (copy from pre-review.ts):**
```typescript
function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / new Set([...a, ...b]).size;
}
```

4. **Conflict classification function:**
```typescript
function classifyConflict(
  problemOverlap: number,
  solutionDiff: number,
): 'alternative' | 'contradictory' | 'superseded' | null {
  if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) return null;
  if (solutionDiff < SOLUTION_DIFF_THRESHOLD) return null;

  if (solutionDiff >= CONTRADICTORY_THRESHOLD) return 'contradictory';
  if (solutionDiff >= ALTERNATIVE_THRESHOLD) return 'alternative';
  return 'superseded';
}
```

5. **Context generation function:**
```typescript
function generateConflictContext(
  entryA: { shortcut: string },
  entryB: { shortcut: string },
  conflictType: 'alternative' | 'contradictory' | 'superseded',
): string {
  const typeDescriptions = {
    alternative: 'Different approaches to the same problem',
    contradictory: 'Opposing solutions for the same problem',
    superseded: 'Newer approach supersedes older one',
  };
  return `${typeDescriptions[conflictType]}: "${entryA.shortcut}" vs "${entryB.shortcut}"`;
}
```

6. **Main detection function:**
```typescript
export interface ConflictDetectionInput {
  services: {
    store: SkillShareerStore;
    data: StoreData;
  };
  entryId: string;
}

export async function detectConflicts(
  input: ConflictDetectionInput,
): Promise<ConflictRelation[]> {
  const { services, entryId } = input;
  const { data } = services;

  // Find the newly approved entry
  const newEntry = data.knowledgeEntries.find((e) => e.id === entryId);
  if (!newEntry || newEntry.lifecycleState !== 'approved') {
    return [];
  }

  const detectedConflicts: ConflictRelation[] = [];
  const newProblemTokens = tokenize(newEntry.shortcut);
  const newSolutionTokens = tokenize(newEntry.detail);

  // Compare against all other approved entries
  for (const existingEntry of data.knowledgeEntries) {
    if (existingEntry.id === entryId) continue;
    if (existingEntry.lifecycleState !== 'approved') continue;

    const existingProblemTokens = tokenize(existingEntry.shortcut);
    const existingSolutionTokens = tokenize(existingEntry.detail);

    const problemOverlap = overlapScore(newProblemTokens, existingProblemTokens);
    const solutionDiff = overlapScore(newSolutionTokens, existingSolutionTokens);

    const conflictType = classifyConflict(problemOverlap, solutionDiff);
    if (!conflictType) continue;

    // Canonical ordering: lower entryId first
    const [entryIdA, entryIdB] = [newEntry.id, existingEntry.id].sort();

    // Check if this conflict already exists
    const existingConflict = data.conflicts.find(
      (c) => c.entryIdA === entryIdA && c.entryIdB === entryIdB,
    );
    if (existingConflict) continue;

    const conflict: ConflictRelation = {
      id: services.store.nextId(data, 'conflict'),
      entryIdA,
      entryIdB,
      conflictType,
      context: generateConflictContext(
        entryIdA === newEntry.id ? newEntry : existingEntry,
        entryIdA === newEntry.id ? existingEntry : newEntry,
        conflictType,
      ),
      problemOverlapScore: problemOverlap,
      solutionDiffScore: solutionDiff,
      detectedAt: nowIso(),
    };

    detectedConflicts.push(conflict);
  }

  // Persist conflicts if any were detected
  if (detectedConflicts.length > 0) {
    await services.store.transact((data) => {
      data.conflicts.push(...detectedConflicts);
    });
  }

  return detectedConflicts;
}
```

7. **Imports needed:**
```typescript
import type { ConflictRelation, SkillShareerStore, StoreData, KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
import type { ConflictType } from '@trapmap/contracts';
```
</action>

<acceptance_criteria>
- File exports `detectConflicts` function with signature `detectConflicts(input: ConflictDetectionInput): Promise<ConflictRelation[]>`
- `tokenize` and `overlapScore` functions exist and match pre-review.ts implementation
- `classifyConflict` returns null if problem overlap < 0.5 or solution diff < 0.3
- `classifyConflict` returns 'contradictory' for solutionDiff >= 0.8
- `classifyConflict` returns 'alternative' for solutionDiff >= 0.4
- `classifyConflict` returns 'superseded' for solutionDiff < 0.4
- Conflicts are stored with canonical ordering (lower entryId as entryIdA)
- Duplicate conflicts (same pair) are not re-created
- Command `pnpm typecheck` exits 0
</acceptance_criteria>

---

### Task 55-02-03: Create conflict detection tests

<read_first>
- packages/server/src/lib/conflict/detect.ts (implementation to test)
- packages/server/src/lib/pre-review.ts (reference for tokenize behavior)
</read_first>

<action>
Create `packages/server/src/lib/conflict/detect.test.ts`:

1. **Test tokenize function:**
   - Tokenizes "Hello World 123" into Set(['hello', 'world', '123'])
   - Filters tokens shorter than 3 characters
   - Converts to lowercase

2. **Test overlapScore function:**
   - Identical sets have score 1.0
   - Disjoint sets have score 0
   - Partial overlap calculated correctly

3. **Test classifyConflict function:**
   - Returns null when problemOverlap < 0.5
   - Returns null when solutionDiff < 0.3
   - Returns 'contradictory' when solutionDiff >= 0.8
   - Returns 'alternative' when solutionDiff >= 0.4 and < 0.8
   - Returns 'superseded' when solutionDiff < 0.4

4. **Test detectConflicts function:**
   - Returns empty array for non-approved entry
   - Returns empty array for entry not found
   - Detects conflict with high problem overlap and high solution diff
   - Does not create duplicate conflicts for same pair
   - Stores conflicts with canonical ordering (lower ID first)

5. **Use mock store for testing:**
   - Create in-memory store mock with `transact` and `nextId`
   - Create test entries with controlled overlap scores
</action>

<acceptance_criteria>
- Test file has `describe('conflict detection', () => {...})` block
- `describe('tokenize', ...)` tests lowercase, filtering, splitting
- `describe('overlapScore', ...)` tests identical, disjoint, partial overlap
- `describe('classifyConflict', ...)` tests all thresholds and null cases
- `describe('detectConflicts', ...)` tests main function with mock data
- Command `pnpm test -- packages/server/src/lib/conflict/detect.test.ts` exits 0
</acceptance_criteria>

---

## Plan 55-03: Retrieval Enrichment and Approval Hook

**Wave:** 2
**Requirements:** CONFLICT-01, CONFLICT-02
**Depends on:** Plan 55-02 (store and detection algorithm)

### Task 55-03-01: Create conflict enrichment module

<read_first>
- packages/server/src/lib/retrieval/assembly.ts (extractEvidenceHint pattern, toRetrievalMatch)
- packages/contracts/src/domain/conflict.ts (ConflictRelation, ConflictHint)
- packages/server/src/lib/store.ts (StoreData with conflicts array)
</read_first>

<action>
Create `packages/server/src/lib/conflict/enrich.ts`:

1. **Build conflict lookup map:**
```typescript
import type { ConflictRelation, ConflictHint, StoreData, KnowledgeRecord } from '../store.js';

/**
 * Build a Map from entryId to its conflicts.
 * Each entry can appear in either entryIdA or entryIdB position.
 */
export function buildConflictLookup(
  conflicts: ConflictRelation[],
): Map<string, ConflictRelation[]> {
  const lookup = new Map<string, ConflictRelation[]>();

  for (const conflict of conflicts) {
    // Add for entryIdA
    const forA = lookup.get(conflict.entryIdA) ?? [];
    forA.push(conflict);
    lookup.set(conflict.entryIdA, forA);

    // Add for entryIdB
    const forB = lookup.get(conflict.entryIdB) ?? [];
    forB.push(conflict);
    lookup.set(conflict.entryIdB, forB);
  }

  return lookup;
}
```

2. **Convert conflict to hint:**
```typescript
/**
 * Convert a ConflictRelation to a ConflictHint for the other entry.
 * @param conflict - The conflict record
 * @param targetEntryId - The entry we're generating a hint for
 * @param allEntries - All knowledge entries to look up shortcut
 */
export function conflictToHint(
  conflict: ConflictRelation,
  targetEntryId: string,
  allEntries: KnowledgeRecord[],
): ConflictHint | null {
  // Find the OTHER entry in this conflict
  const otherEntryId = conflict.entryIdA === targetEntryId
    ? conflict.entryIdB
    : conflict.entryIdA;

  const otherEntry = allEntries.find((e) => e.id === otherEntryId);
  if (!otherEntry) return null;

  return {
    entryId: otherEntryId,
    shortcut: otherEntry.shortcut,
    conflictType: conflict.conflictType,
    context: conflict.context,
  };
}
```

3. **Enrichment function:**
```typescript
/**
 * Get conflict hints for a specific entry.
 * @param entryId - The entry to get conflicts for
 * @param conflictLookup - Pre-built conflict lookup map
 * @param allEntries - All knowledge entries for shortcut lookup
 * @param governance - Governance filters (team, level) to respect
 */
export function getConflictHints(
  entryId: string,
  conflictLookup: Map<string, ConflictRelation[]>,
  allEntries: KnowledgeRecord[],
  governance?: { teamId: string | null; requiredLevel: number },
): ConflictHint[] {
  const conflicts = conflictLookup.get(entryId) ?? [];
  const hints: ConflictHint[] = [];

  for (const conflict of conflicts) {
    // Find the other entry
    const otherEntryId = conflict.entryIdA === entryId
      ? conflict.entryIdB
      : conflict.entryIdA;

    const otherEntry = allEntries.find((e) => e.id === otherEntryId);
    if (!otherEntry) continue;

    // Governance filter: respect team and level
    if (governance) {
      // If entry is team-scoped and user doesn't have team access, skip
      if (otherEntry.teamId && otherEntry.teamId !== governance.teamId) {
        continue;
      }
      // If entry requires higher level than user has, skip
      if (otherEntry.requiredLevel > governance.requiredLevel) {
        continue;
      }
    }

    const hint = conflictToHint(conflict, entryId, allEntries);
    if (hint) hints.push(hint);
  }

  return hints;
}
```

4. **Batch enrichment for retrieval:**
```typescript
/**
 * Enrich multiple retrieval matches with their conflicts.
 * Builds the lookup map once for O(n) performance.
 */
export function enrichMatchesWithConflicts(
  matches: Array<{ entryId: string }>,
  data: StoreData,
  governance?: { teamId: string | null; requiredLevel: number },
): Map<string, ConflictHint[]> {
  const conflictLookup = buildConflictLookup(data.conflicts);
  const result = new Map<string, ConflictHint[]>();

  for (const match of matches) {
    const hints = getConflictHints(
      match.entryId,
      conflictLookup,
      data.knowledgeEntries,
      governance,
    );
    if (hints.length > 0) {
      result.set(match.entryId, hints);
    }
  }

  return result;
}
```
</action>

<acceptance_criteria>
- File exports `buildConflictLookup` function that returns `Map<string, ConflictRelation[]>`
- File exports `conflictToHint` function that converts ConflictRelation to ConflictHint
- File exports `getConflictHints` function that respects governance filters (team, level)
- File exports `enrichMatchesWithConflicts` function that builds lookup once and enriches multiple matches
- Governance filtering skips entries with different teamId
- Governance filtering skips entries with higher requiredLevel
- Command `pnpm typecheck` exits 0
</acceptance_criteria>

---

### Task 55-03-02: Create conflict enrichment tests

<read_first>
- packages/server/src/lib/conflict/enrich.ts (implementation to test)
- packages/server/src/lib/store.ts (store types)
</read_first>

<action>
Create `packages/server/src/lib/conflict/enrich.test.ts`:

1. **Test buildConflictLookup:**
   - Empty conflicts array returns empty Map
   - Single conflict adds entry to lookup for both entryIdA and entryIdB
   - Multiple conflicts for same entry are grouped correctly

2. **Test conflictToHint:**
   - Returns ConflictHint with correct entryId, shortcut, conflictType, context
   - Returns null if other entry not found

3. **Test getConflictHints:**
   - Returns empty array for entry with no conflicts
   - Returns hints for entry with conflicts
   - Respects team governance filter (skips different team)
   - Respects level governance filter (skips higher requiredLevel)

4. **Test enrichMatchesWithConflicts:**
   - Returns Map with hints for matches that have conflicts
   - Builds lookup once (verify with mock)
   - Handles empty matches array
</action>

<acceptance_criteria>
- Test file has `describe('conflict enrichment', () => {...})` block
- `describe('buildConflictLookup', ...)` tests all cases
- `describe('conflictToHint', ...)` tests conversion
- `describe('getConflictHints', ...)` tests governance filtering
- `describe('enrichMatchesWithConflicts', ...)` tests batch enrichment
- Command `pnpm test -- packages/server/src/lib/conflict/enrich.test.ts` exits 0
</acceptance_criteria>

---

### Task 55-03-03: Integrate conflict detection in approval hook

<read_first>
- packages/server/src/routes/review.ts (post-commit indexing pattern, lines 166-186)
- packages/server/src/lib/conflict/detect.ts (detectConflicts function)
</read_first>

<action>
Modify `packages/server/src/routes/review.ts`:

1. Add import at top:
```typescript
import { detectConflicts } from '../lib/conflict/detect.js';
```

2. After the post-commit indexing block (around line 186), add conflict detection:
```typescript
// Trigger conflict detection AFTER approval (post-commit pattern)
// Runs after indexing to avoid nested transactions
if (entryId && previousState && nextState && nextState === 'approved') {
  try {
    await detectConflicts({
      services: {
        store: app.skillShareer.store,
        data: await app.skillShareer.store.snapshot(),
      },
      entryId,
    });
  } catch (conflictError) {
    // Log but don't fail the request - domain state is already committed
    app.log.error({ conflictError, entryId }, 'Post-commit conflict detection failed');
  }
}
```

3. Note: Only trigger when `nextState === 'approved'` (not on rejection, not on other transitions)
</action>

<acceptance_criteria>
- `review.ts` imports `detectConflicts` from `../lib/conflict/detect.js`
- Conflict detection is triggered after post-commit indexing
- Conflict detection is wrapped in try/catch with error logging
- Conflict detection only runs when `nextState === 'approved'`
- Conflict detection does not fail the review request on error
- Command `pnpm typecheck` exits 0
</acceptance_criteria>

---

### Task 55-03-04: Integrate conflict enrichment in retrieval assembly

<read_first>
- packages/server/src/lib/retrieval/assembly.ts (toRetrievalMatch function)
- packages/server/src/lib/conflict/enrich.ts (enrichMatchesWithConflicts)
- packages/server/src/lib/retrieval/orchestrator.ts (where retrieval happens)
</read_first>

<action>
This task identifies WHERE to integrate conflict enrichment. The integration should happen in the retrieval orchestrator or assembly module.

1. Modify `packages/server/src/lib/retrieval/assembly.ts`:

Add import:
```typescript
import { enrichMatchesWithConflicts } from '../conflict/enrich.js';
import type { StoreData } from '../store.js';
```

2. Modify `toRetrievalMatch` function signature to accept optional conflicts:
```typescript
export function toRetrievalMatch(
  scoredEntry: ScoredEntry,
  filters: RetrievalQuery['filters'],
  citation?: RetrievalCitation,
  decayMultiplier?: number,
  conflicts?: ConflictHint[],  // NEW PARAMETER
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
    ...(conflicts && conflicts.length > 0 ? { conflicts } : {}),
  });
}
```

3. Modify `assembleResponseBuckets` to accept enrichment data:
```typescript
export function assembleResponseBuckets(
  scoredEntries: ScoredEntry[],
  filters: RetrievalQuery['filters'],
  citations?: Map<string, RetrievalCitation>,
  conflictHints?: Map<string, ConflictHint[]>,  // NEW PARAMETER
): {
  globalConstraints: RetrievalMatch[];
  projectKnowledge: RetrievalMatch[];
} {
  // ... existing logic, pass conflictHints to toRetrievalMatch
  const match = toRetrievalMatch(
    scoredEntry,
    filters,
    citation,
    undefined, // decayMultiplier
    conflictHints?.get(scoredEntry.entry.id),
  );
}
```

Note: The actual integration point depends on where the retrieval orchestrator calls these functions. The enrichment should be called once per retrieval request, not per match.
</action>

<acceptance_criteria>
- `assembly.ts` imports `ConflictHint` type and `enrichMatchesWithConflicts` function
- `toRetrievalMatch` accepts optional `conflicts` parameter
- When conflicts provided and non-empty, they are included in the match object
- `assembleResponseBuckets` accepts optional `conflictHints` Map parameter
- Command `pnpm typecheck` exits 0
</acceptance_criteria>

---

## Plan 55-04: CLI Display for Conflict Information

**Wave:** 3
**Requirements:** CONFLICT-02
**Depends on:** Plan 55-03 (enrichment must work)

### Task 55-04-01: Display conflicts in CLI retrieval output

<read_first>
- packages/cli/src/commands/retrieval.ts (formatMatch, formatCapsuleMatch functions)
- packages/contracts/src/domain/conflict.ts (ConflictHint type)
</read_first>

<action>
Modify `packages/cli/src/commands/retrieval.ts`:

1. Add type import:
```typescript
import type { ConflictHint } from '@trapmap/contracts';
```

2. Create conflict formatting function:
```typescript
/**
 * Format conflict hints for display.
 * Shows conflict type and context for each conflicting entry.
 */
function formatConflicts(conflicts: ConflictHint[]): string {
  const lines = ['Conflicts:'];
  for (const conflict of conflicts) {
    const typeLabel = {
      alternative: '[alt]',
      contradictory: '[!]',
      superseded: '[old]',
    }[conflict.conflictType];
    lines.push(`  ${typeLabel} ${conflict.shortcut} (${conflict.entryId})`);
    lines.push(`      ${conflict.context}`);
  }
  return lines.join('\n');
}
```

3. Modify `formatMatch` function to include conflicts:
```typescript
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

  // Add conflict information if available (Phase 55: CONFLICT-02)
  if (match.conflicts?.length) {
    lines.push(formatConflicts(match.conflicts));
  }

  return lines.join('\n');
}
```

4. Modify `formatCapsuleMatch` similarly:
```typescript
function formatCapsuleMatch(capsule: CapsuleMatch): string {
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

  // Add conflict information if available (Phase 55: CONFLICT-02)
  if (capsule.conflicts?.length) {
    lines.push(formatConflicts(capsule.conflicts));
  }

  return lines.join('\n');
}
```

5. Update the `CapsuleMatch` type usage to include conflicts field (the schema already has it from Plan 55-01)
</action>

<acceptance_criteria>
- CLI file imports `ConflictHint` type from `@trapmap/contracts`
- `formatConflicts` function exists and formats conflicts with type labels [alt], [!], [old]
- `formatMatch` function includes conflict display when `match.conflicts?.length` is truthy
- `formatCapsuleMatch` function includes conflict display when `capsule.conflicts?.length` is truthy
- Command `pnpm typecheck` exits 0
- Command `pnpm build -- packages/cli` exits 0
</acceptance_criteria>

---

## Verification Criteria

### Automated Verification

1. **Schema Tests:**
   ```bash
   pnpm test -- packages/contracts/src/domain/conflict.test.ts
   ```

2. **Detection Algorithm Tests:**
   ```bash
   pnpm test -- packages/server/src/lib/conflict/detect.test.ts
   ```

3. **Enrichment Tests:**
   ```bash
   pnpm test -- packages/server/src/lib/conflict/enrich.test.ts
   ```

4. **Type Check:**
   ```bash
   pnpm typecheck
   ```

5. **Build:**
   ```bash
   pnpm build
   ```

6. **Full Test Suite:**
   ```bash
   pnpm test
   ```

### Manual Verification

1. **Conflict Display:**
   - Run retrieval with entries that have conflicts
   - Verify conflict section appears with correct formatting
   - Verify [alt], [!], [old] labels display correctly

---

## Must-Haves (Goal-Backward Verification)

From the phase goal: "Detect conflicting knowledge entries and display relationships in retrieval."

| Capability | How to Verify |
|------------|---------------|
| Conflict detection runs on approval | `detectConflicts` is called in `review.ts` after state transition to 'approved' |
| Conflicts stored with type | `conflictRelationSchema` has `conflictType` field, `StoreData.conflicts` array exists |
| Retrieval includes conflicts field | `retrievalMatchSchema` and `capsuleMatchSchema` have optional `conflicts` field |
| Users can see conflict context | CLI `formatMatch` displays conflicts with context when present |
| Governance filtering works | `getConflictHints` filters by team and requiredLevel |

---

## Rollback Plan

If issues arise:
1. Conflict detection errors are logged but don't fail the approval (fire-and-forget pattern)
2. Conflicts field is optional - existing clients continue to work
3. To disable: remove the conflict detection call from review.ts
4. To clean up data: `data.conflicts = []` in store transaction

---

## Future Enhancements (Out of Scope)

- Skill artifact conflict detection (only knowledge entries for v1)
- Conflict resolution workflow
- Automatic superseded conflict creation from batch operations
- Conflict re-evaluation on content update
- Admin UI for conflict management
