# Phase 55: Conflict Detection & Display - Research

**Researched:** 2026-05-03
**Domain:** Knowledge conflict detection, relationship storage, retrieval augmentation
**Confidence:** HIGH

## Summary

Phase 55 introduces conflict detection between knowledge entries and displays conflict relationships in retrieval results. The system must identify when multiple approved knowledge entries address the same problem with different solutions, classify the conflict type (alternative, contradictory, superseded), and expose these relationships in retrieval responses so users can make informed choices.

The codebase already has a robust foundation for this: a pre-review duplicate detection system (`pre-review.ts`) using token overlap scoring, an approval workflow (`review.ts` -> `applyReviewDecision`), a GraphRAG-lite indexing layer with typed edge relationships (`graph-lite/`), and well-established retrieval pipelines (v1 entry-based, v2 capsule-native). Conflict detection builds on the approval event hook (post-commit indexing pattern), stores conflict edges in the existing graph infrastructure, and augments retrieval match schemas with a `conflicts` field.

**Primary recommendation:** Store conflict relationships as a new collection in `StoreData` (similar to `duplicateCases`) with a typed `conflictType` enum. Run conflict detection as a post-approval hook using the existing token-overlap algorithm from `pre-review.ts` enhanced with solution-difference analysis. Expose conflicts through an additive `conflicts` field on `retrievalMatchSchema` and `capsuleMatchSchema`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion -- discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Claude's Discretion
All implementation choices are at Claude's discretion -- discuss phase was skipped per user setting.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONFLICT-01 | System detects when multiple knowledge entries address the same problem with different solutions | Conflict detection module using enhanced token-overlap + solution-diff analysis, triggered on approval via post-commit hook pattern |
| CONFLICT-02 | Retrieval results display conflict relationships with context allowing users to choose appropriate solutions | Additive `conflicts` field on retrieval match schemas, CLI display formatting, server-side conflict enrichment in retrieval pipeline |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Conflict detection trigger | API / Backend | -- | Detection runs server-side on approval event (post-commit hook) |
| Conflict relationship storage | Database / Storage | -- | New collection in StoreData, persisted via transact() |
| Conflict type classification | API / Backend | -- | Algorithmic classification (alternative/contradictory/superseded) based on content analysis |
| Retrieval conflict enrichment | API / Backend | -- | Server attaches conflicts to retrieval matches before response |
| Conflict display in CLI | Browser / Client | -- | CLI formats conflict information for terminal output |
| Conflict schema contracts | API / Backend | -- | Zod schemas in packages/contracts |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.1.12 | Schema definition and validation | [VERIFIED: package.json] Project standard for all contracts |
| vitest | ^3.2.4 | Test framework | [VERIFIED: package.json] Project standard |
| fastify | (existing) | HTTP server framework | [VERIFIED: codebase] Project standard |
| graphology | (existing) | Graph structure for relationships | [VERIFIED: codebase] Already used in graph-lite module |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm/pg-core | (existing) | Schema definition for future relational migration | If adding a dedicated conflict table in PostgreSQL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| StoreData array collection | PostgreSQL table | PG table is better for scale but StoreData array follows established pattern for incremental features (see duplicateCases, feedbackQueue) |

## Architecture Patterns

### System Architecture Diagram

```
                  Knowledge Submission
                         |
                         v
                +------------------+
                |  Approval Flow   |
                | (review.ts)      |
                +--------+---------+
                         |  (post-commit hook)
                         v
                +------------------+
                | Conflict         |<--- compares new entry against
                | Detector         |     all other approved entries
                | (NEW)            |
                +--------+---------+
                         |
                         |  writes ConflictRecord[]
                         v
                +------------------+
                | StoreData        |
                | .conflicts[]     |  (new collection, like duplicateCases)
                +--------+---------+
                         |
                         |  read at query time
                         v
                +------------------+
                | Retrieval        |
                | Orchestrator     |
                | (orchestrator.ts)|
                +--------+---------+
                         |
                         |  enriches matches with conflicts
                         v
                +------------------+
                | Retrieval        |
                | Response         |  .conflicts field on each match
                | (contracts)      |
                +--------+---------+
                         |
                         v
                +------------------+
                | CLI Display      |
                | (retrieval.ts)   |
                +------------------+
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  conflict.ts              # Conflict relationship Zod schemas
  conflict.test.ts         # Schema validation tests

packages/server/src/lib/
  conflict/
    detect.ts              # Conflict detection algorithm
    detect.test.ts         # Detection algorithm tests
    enrich.ts              # Retrieval conflict enrichment
    enrich.test.ts         # Enrichment tests

packages/server/src/routes/
  (no new route file)      # Conflicts are detected automatically, not via endpoint

packages/cli/src/commands/
  retrieval.ts             # Modified to display conflicts
```

### Pattern 1: Post-Commit Hook for Conflict Detection
**What:** Trigger conflict detection after a knowledge entry is approved, using the same post-commit pattern as indexing.
**When to use:** Every time an entry transitions to `approved` lifecycle state.
**Example:**
```typescript
// In review.ts, after applyReviewDecision:
if (entryId && previousState !== nextState && nextState === 'approved') {
  try {
    await detectConflicts({
      services: { store: app.skillShareer.store },
      entryId,
      data: await app.skillShareer.store.snapshot(),
    });
  } catch (conflictError) {
    app.log.error({ conflictError, entryId }, 'Post-commit conflict detection failed');
    // Don't fail the request - domain state is already committed
  }
}
```

### Pattern 2: StoreData Array Collection
**What:** Store conflicts as a new array in StoreData, following the pattern of `duplicateCases`, `candidateSubmissions`, and `feedbackQueue`.
**When to use:** For incremental features that don't need high-performance querying.
**Example:**
```typescript
// In store.ts StoreData interface:
export interface StoreData {
  // ... existing fields ...
  /** Detected conflict relationships between knowledge entries */
  conflicts: ConflictRecord[];
}

// EMPTY_STORE:
conflicts: [],
```

### Pattern 3: Additive Schema Extension
**What:** Add an optional `conflicts` field to existing retrieval schemas without breaking backward compatibility.
**When to use:** Augmenting retrieval response types with new relationship data.
**Example:**
```typescript
// In retrieval.ts contracts:
export const conflictRelationSchema = z.object({
  entryId: entityIdSchema,
  shortcut: z.string(),
  conflictType: z.enum(['alternative', 'contradictory', 'superseded']),
  context: z.string(), // brief explanation of the conflict
});

// Additive field on retrievalMatchSchema:
// conflicts: z.array(conflictRelationSchema).optional()
```

### Anti-Patterns to Avoid
- **Detecting conflicts on every retrieval:** Do NOT run conflict detection at query time. It is expensive and should only run on approval. Read pre-computed results at retrieval time.
- **Blocking the approval response on conflict detection:** Follow the post-commit fire-and-forget pattern from the existing indexing code. Log errors but never fail the review response.
- **Conflicting with the duplicate detection system:** The candidates module handles submission-time duplicate detection. Conflict detection is different -- it runs on approved entries and focuses on different solutions to the same problem, not identical content.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token overlap scoring | Custom string similarity | Existing `tokenize()` + `overlapScore()` from `pre-review.ts` | Already battle-tested in pre-review, same domain |
| Graph edge storage | Custom graph persistence | Existing `GraphEdgeRecord` from graph-lite documents | Typed relation vocabulary already exists |
| Approval event hooking | Custom event system | Post-commit pattern in `review.ts` (lines 166-186) | Established pattern for post-mutation side effects |
| Schema validation | Custom validation | Zod schemas in `packages/contracts` | Project standard |

**Key insight:** The pre-review module already solves the "same problem" part of conflict detection (token overlap). The new work is adding "different solutions" analysis and conflict type classification.

## Common Pitfalls

### Pitfall 1: Confusing Conflict Detection with Duplicate Detection
**What goes wrong:** Implementing conflict detection as a variant of duplicate detection, flagging entries with identical content.
**Why it happens:** The pre-review module uses overlap scoring that is naturally sensitive to similar content.
**How to avoid:** Conflict detection must look for entries with HIGH problem overlap but LOW solution overlap. Two entries are "conflicting" when they address the same problem domain but propose meaningfully different approaches. Adjust the scoring algorithm to compare problem (shortcut) vs solution (detail) dimensions separately.
**Warning signs:** Every approved entry flags the same entry as conflicting because they share labels.

### Pitfall 2: N+1 Conflict Enrichment at Retrieval Time
**What goes wrong:** For each retrieval match, scanning all conflicts to find relevant ones, causing O(n*m) performance.
**Why it happens:** Conflicts stored in a flat array without indexing.
**How to avoid:** At retrieval enrichment time, build a Map keyed by entryId from the conflicts array once, then look up conflicts for each match in O(1). This is the same pattern used by `eligibleEntriesMap` in the graph-assisted retrieval path.
**Warning signs:** Retrieval latency increases linearly with the number of conflicts in the system.

### Pitfall 3: Storing Bidirectional Conflicts Redundantly
**What goes wrong:** Storing both A-conflicts-with-B and B-conflicts-with-A as separate records.
**Why it happens:** Treating conflicts as directed edges when they are naturally undirected.
**How to avoid:** Store each conflict once with a canonical ordering (lower entryId first). At enrichment time, look up conflicts involving either entry.
**Warning signs:** Conflict count doubles, UI shows duplicate conflict entries.

### Pitfall 4: Breaking Backward Compatibility on Retrieval Schemas
**What goes wrong:** Making `conflicts` a required field, causing existing clients to fail validation.
**Why it happens:** Adding the field without `.optional()` or `.default([])`.
**How to avoid:** Use `.optional()` or `.default([])` on the `conflicts` field in retrieval match schemas. Existing clients that don't know about conflicts simply ignore the field.
**Warning signs:** Existing retrieval tests fail after adding the field.

### Pitfall 5: Running Conflict Detection on Rejection
**What goes wrong:** Triggering conflict detection when an entry is rejected, creating conflicts involving non-approved entries.
**Why it happens:** Not checking the lifecycle state transition direction.
**How to avoid:** Only trigger when `nextState === 'approved'` AND `previousState !== nextState`. Rejected entries should never participate in conflict relationships.
**Warning signs:** Conflicts reference entries in `rejected` or `submitted` lifecycle states.

## Code Examples

### Conflict Schema (contracts/domain/conflict.ts)
```typescript
import { z } from 'zod';
import { entityIdSchema, isoTimestampSchema } from './common.js';

/**
 * Conflict type classification.
 *
 * - alternative: Different valid approaches to the same problem (e.g., REST vs GraphQL)
 * - contradictory: Directly opposing solutions (e.g., "use X" vs "avoid X")
 * - superseded: Newer entry replaces an older approach
 */
export const conflictTypeSchema = z.enum(['alternative', 'contradictory', 'superseded']);

/**
 * Conflict relationship between two knowledge entries.
 * Stored once per pair (canonical ordering: lower entryId first).
 */
export const conflictRelationSchema = z.object({
  /** Unique conflict identifier */
  id: entityIdSchema,
  /** First entry (lower entryId for canonical ordering) */
  entryIdA: entityIdSchema,
  /** Second entry (higher entryId) */
  entryIdB: entityIdSchema,
  /** Classified conflict type */
  conflictType: conflictTypeSchema,
  /** Brief explanation of why these entries conflict */
  context: z.string().min(1).max(500),
  /** Problem overlap score (0-1, how similar the problems are) */
  problemOverlapScore: z.number().min(0).max(1),
  /** Solution difference score (0-1, how different the solutions are) */
  solutionDiffScore: z.number().min(0).max(1),
  /** When this conflict was detected */
  detectedAt: isoTimestampSchema,
});

/**
 * Compact conflict hint for retrieval responses.
 * Excludes scoring details for compact payload.
 */
export const conflictHintSchema = z.object({
  /** Conflicting entry ID */
  entryId: entityIdSchema,
  /** Shortcut of the conflicting entry */
  shortcut: z.string(),
  /** Conflict type */
  conflictType: conflictTypeSchema,
  /** Brief context for the user */
  context: z.string(),
});

export type ConflictType = z.infer<typeof conflictTypeSchema>;
export type ConflictRelation = z.infer<typeof conflictRelationSchema>;
export type ConflictHint = z.infer<typeof conflictHintSchema>;
```

### Retrieval Match Extension (contracts/domain/retrieval.ts)
```typescript
// Additive field on retrievalMatchSchema:
// After existing fields, add:
conflicts: z.array(conflictHintSchema).optional(),

// Same for capsuleMatchSchema:
conflicts: z.array(conflictHintSchema).optional(),
```

### Conflict Detection Algorithm (server/src/lib/conflict/detect.ts)
```typescript
// Reuse tokenize() and overlapScore() from pre-review.ts
// New: separate problem scoring vs solution scoring
// Problem = shortcut field, Solution = detail field

function classifyConflict(
  problemOverlap: number,
  solutionDiff: number,
): 'alternative' | 'contradictory' | 'superseded' | null {
  // Must have high problem overlap AND meaningful solution difference
  if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) return null;
  if (solutionDiff < SOLUTION_DIFF_THRESHOLD) return null;

  // Classification logic:
  // contradictory: very high solution difference (opposing approaches)
  // alternative: moderate solution difference (different valid approaches)
  // superseded: low solution difference (incremental improvement)
  if (solutionDiff >= 0.8) return 'contradictory';
  if (solutionDiff >= 0.4) return 'alternative';
  return 'superseded';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pre-review only detects duplicates | Conflict detection on approval | This phase | Separates duplicate detection (same content) from conflict detection (different solutions to same problem) |
| Flat retrieval results | Conflict-aware retrieval | This phase | Users see alternatives and contradictions alongside matches |

**Deprecated/outdated:**
- None -- this is a new capability.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Conflict detection should use the same tokenize/overlap approach as pre-review | Standard Stack, Code Examples | If a different algorithm is needed, detection module needs redesign |
| A2 | Conflicts are undirected (entryA conflicts with entryB implies B conflicts with A) | Common Pitfalls | If conflicts should be directional, schema and enrichment logic change |
| A3 | Conflict detection runs only on approval, not on update or re-submission | Architecture Patterns | If conflicts should be re-evaluated on content changes, need additional triggers |
| A4 | The three conflict types (alternative, contradictory, superseded) are sufficient for v1 | Code Examples | If more types are needed, schema extension required |
| A5 | No dedicated API endpoint is needed for conflict management (no CRUD operations) | Recommended Structure | If admin UI needs conflict management, need new route file |

## Open Questions

1. **Should conflict detection also consider skill artifacts, or only knowledge entries?**
   - What we know: The codebase has both `knowledgeEntries` and `skillArtifacts`. Skill artifacts also have capsules with problem/solution content.
   - What's unclear: Whether the requirement scope includes skill-to-skill or skill-to-entry conflicts.
   - Recommendation: Start with knowledge entries only (CONFLICT-01/02 focus on "knowledge entries"). Skill conflicts can be a future enhancement.

2. **Should superseded conflicts be automatically created when batch-supersede operations run (DECAY-03 batch actions)?**
   - What we know: The decay batch system already has a `supersede` action that sets `supersededById`.
   - What's unclear: Whether the superseded conflict type should link to the existing batch supersede action.
   - Recommendation: YES -- when a batch supersede runs, it should also create a conflict record. This connects the decay system to the conflict system.

3. **Threshold values for problem overlap and solution difference scoring**
   - What we know: Pre-review uses 0.72 for high risk and 0.38 for medium risk.
   - What's unclear: The right thresholds for "same problem, different solution" detection.
   - Recommendation: Make thresholds configurable constants (not hardcoded) so they can be tuned. Start with problem overlap >= 0.5 and solution difference >= 0.3.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- conflict detection uses existing in-process algorithms and store operations).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.2.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm test -- --reporter=verbose packages/contracts/src/domain/conflict.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONFLICT-01 | Detects entries addressing same problem with different solutions | unit | `pnpm test -- packages/server/src/lib/conflict/detect.test.ts` | Wave 0 |
| CONFLICT-01 | Classifies conflict type correctly (alternative/contradictory/superseded) | unit | `pnpm test -- packages/server/src/lib/conflict/detect.test.ts` | Wave 0 |
| CONFLICT-01 | Conflict detection triggers on approval | integration | `pnpm test -- packages/server/src/routes/review.test.ts` | Existing |
| CONFLICT-02 | Retrieval match includes conflicts field | unit | `pnpm test -- packages/server/src/lib/conflict/enrich.test.ts` | Wave 0 |
| CONFLICT-02 | CLI displays conflict information | unit | `pnpm test -- packages/cli/src/commands/retrieval.test.ts` | Existing |

### Sampling Rate
- **Per task commit:** `pnpm test -- packages/contracts packages/server/src/lib/conflict`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/contracts/src/domain/conflict.ts` -- conflict schema definitions
- [ ] `packages/contracts/src/domain/conflict.test.ts` -- schema validation tests
- [ ] `packages/server/src/lib/conflict/detect.ts` -- detection algorithm
- [ ] `packages/server/src/lib/conflict/detect.test.ts` -- detection algorithm tests
- [ ] `packages/server/src/lib/conflict/enrich.ts` -- retrieval enrichment
- [ ] `packages/server/src/lib/conflict/enrich.test.ts` -- enrichment tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A -- no new auth flows |
| V3 Session Management | no | N/A -- no session changes |
| V4 Access Control | yes | Conflict enrichment respects existing governance (team, level) |
| V5 Input Validation | yes | Zod schema validation on all conflict data |
| V6 Cryptography | no | N/A -- no cryptographic operations |

### Known Threat Patterns for Conflict Detection

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Information disclosure via conflicts | Information Disclosure | Conflict enrichment must respect same governance filters as retrieval (team, security level) -- a user should only see conflicts for entries they can access |
| Conflict flooding (gaming detection) | Denial of Service | Conflict detection runs server-side on approval only; no user-controlled trigger |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/contracts/src/domain/` -- all schema definitions
- Codebase analysis: `packages/server/src/lib/pre-review.ts` -- token overlap algorithm
- Codebase analysis: `packages/server/src/routes/review.ts` -- approval flow and post-commit hook pattern
- Codebase analysis: `packages/server/src/lib/retrieval/orchestrator.ts` -- retrieval pipeline
- Codebase analysis: `packages/server/src/lib/store.ts` -- StoreData structure
- Codebase analysis: `packages/server/src/lib/indexing/graph-lite/` -- graph relationship infrastructure

### Secondary (MEDIUM confidence)
- Codebase analysis: `packages/cli/src/commands/retrieval.ts` -- CLI display formatting

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use in the project
- Architecture: HIGH - follows established patterns (StoreData array, post-commit hook, additive schema)
- Pitfalls: HIGH - derived from deep analysis of existing codebase patterns and potential failure modes

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable codebase patterns)
