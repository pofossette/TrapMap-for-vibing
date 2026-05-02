# Phase 58: Evidence Metadata & Verification Surface - Research

**Researched:** 2026-05-02
**Domain:** Knowledge provenance and verification metadata for trust visibility
**Confidence:** HIGH

## Summary

Phase 58 introduces minimal provenance and verification metadata so published knowledge can show where it came from, when it was verified, and how strong the evidence is. This is a compact trust metadata layer that extends existing contracts and review surfaces without requiring a new retrieval architecture.

The implementation builds on:
- **Phase 48 (Lifecycle State Machine)**: Already adds `DecayMeta` with `lastVerifiedAt` to `KnowledgeRecord` and `SkillArtifactRecord`
- **Phase 51 (Boundary Schema Definition)**: Will define a boundary evidence layer for applicability assertions
- **Existing review flow**: Provides the natural capture point for evidence metadata
- **Existing audit infrastructure**: Can absorb evidence mutations

**Primary recommendation:** Add a compact `EvidenceMeta` schema to contracts, extend it on both `KnowledgeRecord` and `SkillArtifactRecord`, integrate evidence capture into the review decision flow, expose evidence in retrieval responses as an additive field, and provide admin query capabilities through existing audit/operations patterns.

## Requirements Mapping

| Requirement ID | Description | Success Criteria Covered |
|----------------|-------------|-------------------------|
| EVIDENCE-01 | Minimal evidence and provenance metadata | SC 1, SC 2 |
| EVIDENCE-02 | Retrieval/admin evidence visibility | SC 3, SC 4 |

**Success Criteria Analysis:**

1. **SC1: Trap and skill records store evidence metadata** (`sourceType`, `sourceRef`, `evidenceLevel`, `verifiedAt`, `verifiedBy`)
   - New `EvidenceMeta` schema in contracts
   - Add `evidenceMeta` field to both `KnowledgeRecord` and `SkillArtifactRecord`
   - Reuse `ActorRef` for `verifiedBy`, `isoTimestampSchema` for timestamps

2. **SC2: Review flow captures/edits evidence metadata before approval**
   - Extend `reviewDecisionRequestSchema` with optional evidence fields
   - Modify `applyReviewDecision` in `lib/knowledge.ts` to persist evidence
   - Default `verifiedAt` to decision timestamp, `verifiedBy` to reviewer

3. **SC3: Retrieval responses expose evidence metadata in additive, compact form**
   - Add optional `evidence` field to `capsuleMatchSchema` and `retrievalMatchSchema`
   - Keep compact: only expose `evidenceLevel`, `verifiedAt`, `sourceType`
   - Full metadata available via entry detail endpoints

4. **SC4: Evidence metadata queryable in admin views and audit-friendly**
   - Add evidence filter to admin list commands
   - Record evidence changes as audit events
   - Support filtering by `evidenceLevel`, `sourceType`, verification date range

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Evidence schema definition | Contracts | -- | Shared vocabulary across CLI, server, and clients |
| Evidence persistence | API / Backend | -- | Store on knowledge/artifact records |
| Evidence capture in review | API / Backend | -- | Review flow already handles decision metadata |
| Evidence in retrieval response | API / Backend | -- | Additive field on existing response schemas |
| Evidence query/filter | API / Backend | CLI | Admin queries via CLI, server handles filtering |
| Evidence audit trail | API / Backend | -- | Reuse existing audit infrastructure |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^4.3.6 | Schema validation for evidence metadata | Already in use across all packages for contract validation |
| vitest | ^4.1.5 | Testing evidence capture and exposure | Existing test framework in monorepo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | -- | -- | No new dependencies required |

**Installation:**
```bash
# No new packages needed -- zod and vitest already installed
```

## Architecture Patterns

### System Architecture Diagram

```
                    Review Decision
                    (with evidence)
                         |
                         v
              +------------------+
              | EvidenceMeta     |
              | - sourceType     |
              | - sourceRef      |
              | - evidenceLevel  |
              | - verifiedAt     |
              | - verifiedBy     |
              +--------+---------+
                       |
   +-------------------+-------------------+
   |                                       |
   v                                       v
+------------------+              +------------------+
| KnowledgeRecord  |              | SkillArtifact    |
| evidenceMeta     |              | Record           |
| (nullable)       |              | evidenceMeta     |
+--------+---------+              +--------+----------+
         |                         |
         +------------+------------+
                      |
                      v
           +---------------------+
           | Retrieval Response  |
           | (additive evidence  |
           |  field, compact)    |
           +----------+----------+
                      |
                      v
           +---------------------+
           | Admin Views         |
           | - filter by level   |
           | - filter by source  |
           | - audit trail       |
           +---------------------+

Evidence Flow:
  1. Reviewer approves with evidence → evidenceMeta persisted
  2. Retrieval query → evidence exposed in response
  3. Admin query → filter/audit evidence metadata
```

### Recommended Project Structure

```
packages/contracts/src/domain/
  evidence.ts                    # NEW: evidence schema, source type enum, evidence level enum
  (update knowledge.ts)          # add evidenceMeta to knowledgeEntrySchema
  (update artifacts.ts)          # add evidenceMeta to skillArtifactSchema
  (update retrieval.ts)          # add evidence hint to capsuleMatchSchema

packages/server/src/lib/
  evidence/
    model.ts                     # evidence validation and defaults
    model.test.ts                # unit tests
  (update knowledge.ts)          # applyReviewDecision persists evidence
  (update store.ts)              # add evidenceMeta to record types

packages/server/src/routes/
  (update review.ts)             # accept evidence in review decision
  (update retrieval.ts)          # include evidence in response
  (update operations.ts)         # admin evidence query

packages/cli/src/commands/
  (update knowledge.ts)          # --evidence flags for review command
  (update trap.ts)               # admin evidence query commands
```

### Pattern 1: Evidence Meta Schema

**What:** A compact schema capturing provenance and verification strength for a knowledge entry.

**When to use:** Attach to any knowledge entry or skill artifact that has been through review.

**Example:**
```typescript
// packages/contracts/src/domain/evidence.ts
import { z } from 'zod';
import { actorRefSchema, entityIdSchema, isoTimestampSchema } from './common.js';

/**
 * Source type vocabulary for knowledge provenance.
 * Intentionally small for v1 - expandable in future phases.
 */
export const evidenceSourceTypeSchema = z.enum([
  'internal-experience',  // Team's own experience, not externally documented
  'incident',             // Derived from incident postmortem or outage
  'doc',                  // Official documentation (internal or external)
  'code',                 // Derived from source code analysis
  'external-reference',   // External blog, article, or community knowledge
]);

/**
 * Evidence strength level indicating verification rigor.
 * Higher levels indicate stronger verification.
 */
export const evidenceLevelSchema = z.enum([
  'anecdotal',        // Single occurrence, no reproduction
  'reproduced',       // Reproduced in controlled environment
  'documented',       // Supported by documentation
  'verified-in-prod', // Verified in production environment
]);

/**
 * Minimal evidence and provenance metadata.
 * Captures where knowledge came from and how strongly it was verified.
 */
export const evidenceMetaSchema = z.object({
  /** Type of source where this knowledge originated */
  sourceType: evidenceSourceTypeSchema,
  /** Reference to source (URL, doc ID, incident ID, etc.) */
  sourceRef: z.string().max(500).optional(),
  /** Strength of evidence supporting this knowledge */
  evidenceLevel: evidenceLevelSchema,
  /** When this knowledge was last verified by a human */
  verifiedAt: isoTimestampSchema,
  /** Who verified this knowledge */
  verifiedBy: actorRefSchema,
});

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
```

### Pattern 2: Evidence in Review Decision

**What:** Extend the review decision flow to capture evidence metadata at approval time.

**When to use:** When a reviewer approves a knowledge entry.

**Example:**
```typescript
// Extended review decision request
export const reviewDecisionRequestSchema = z.object({
  entryId: entityIdSchema,
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
  // NEW: Optional evidence metadata (required for approval)
  evidence: evidenceMetaSchema.optional(),
});

// In applyReviewDecision (lib/knowledge.ts)
function applyReviewDecision(args: {
  // ... existing args
  evidence?: EvidenceMeta;
}) {
  // ... existing approval logic

  // On approval, persist evidence metadata
  if (args.decision === 'approve' && args.evidence) {
    entry.evidenceMeta = {
      ...args.evidence,
      verifiedAt: args.evidence.verifiedAt ?? decidedAt,
      verifiedBy: args.evidence.verifiedBy ?? reviewerActorRef,
    };
  } else if (args.decision === 'approve') {
    // Default evidence when not explicitly provided
    entry.evidenceMeta = {
      sourceType: 'internal-experience',
      evidenceLevel: 'anecdotal',
      verifiedAt: decidedAt,
      verifiedBy: reviewerActorRef,
    };
  }
}
```

### Pattern 3: Evidence in Retrieval Response

**What:** Add compact evidence visibility to retrieval responses without bloating the payload.

**When to use:** When returning retrieval results that include evidence metadata.

**Example:**
```typescript
// Compact evidence hint for retrieval responses
export const evidenceHintSchema = z.object({
  /** Strength of evidence */
  evidenceLevel: evidenceLevelSchema,
  /** When last verified */
  verifiedAt: isoTimestampSchema,
  /** Type of source */
  sourceType: evidenceSourceTypeSchema,
});

// Add to capsuleMatchSchema
export const capsuleMatchSchema = z.object({
  // ... existing fields
  /** Optional evidence metadata (present when knowledge has been verified) */
  evidence: evidenceHintSchema.optional(),
});

// Add to retrievalMatchSchema (v1)
export const retrievalMatchSchema = z.object({
  // ... existing fields
  evidence: evidenceHintSchema.optional(),
});
```

### Pattern 4: Evidence in Admin Views

**What:** Provide filtering and listing capabilities for evidence metadata.

**When to use:** Admin needs to find entries by evidence level or verification status.

**Example:**
```typescript
// Admin query for evidence-based filtering
export const knowledgeListQuerySchema = paginatedQuerySchema.extend({
  // ... existing filters
  evidenceLevel: z.array(evidenceLevelSchema).optional(),
  sourceType: z.array(evidenceSourceTypeSchema).optional(),
  verifiedBefore: isoTimestampSchema.optional(),
  verifiedAfter: isoTimestampSchema.optional(),
  missingEvidence: z.boolean().optional(),
});

// CLI command for evidence audit
// trapmap admin evidence list --level anecdotal --missing-verification
```

### Alignment with Phase 51 Boundary Evidence

Phase 51 defines a `boundary.evidence` layer for applicability assertions. Phase 58's `EvidenceMeta` serves a different purpose:

| Aspect | Phase 51 Boundary Evidence | Phase 58 Evidence Metadata |
|--------|---------------------------|---------------------------|
| Purpose | Confidence/provenance of boundary assertions | Overall knowledge provenance |
| Scope | Per-boundary constraint | Per-knowledge entry |
| Capture | Boundary capture flow | Review approval flow |
| Visibility | Boundary explanation in retrieval | Compact trust hint in retrieval |

**Recommendation:** Keep schemas separate but allow cross-referencing:
- `EvidenceMeta.verifiedAt` can inform boundary evidence confidence
- Phase 54 retrieval can combine both for trust scoring

### Anti-Patterns to Avoid

- **Storing evidence as unstructured notes**: Evidence metadata must be structured and queryable. Free-text notes don't support filtering or ranking. [VERIFIED: existing reviewNotes pattern is separate]

- **Conflating evidence with decay**: `DecayMeta.lastVerifiedAt` tracks lifecycle; `EvidenceMeta.verifiedAt` tracks trust verification. They serve different purposes and may diverge (e.g., re-verified without decay reset). [VERIFIED: Phase 48 patterns]

- **Making evidence mandatory for all knowledge**: Legacy entries won't have evidence. Missing evidence should be visible but not block retrieval. [VERIFIED: nullable field pattern from decayMeta]

- **Exposing full evidence metadata in every retrieval**: Full `sourceRef` and `verifiedBy` details bloat responses. Use compact hints in retrieval, full details in entry endpoints. [VERIFIED: capsuleMatchSchema pattern]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Actor reference for verifiedBy | Custom user ID field | `actorRefSchema` from common.ts | Consistent with existing reviewer/owner patterns |
| Timestamp for verifiedAt | Custom date handling | `isoTimestampSchema` | Consistent with all other timestamp fields |
| Evidence query filtering | Custom filter logic | Existing `queryAuditEvents` pattern | Reuse proven query infrastructure |
| Evidence in review flow | New approval path | Extend `applyReviewDecision` | Existing pattern handles all approval logic |

## Common Pitfalls

### Pitfall 1: Missing Evidence on Legacy Entries

**What goes wrong:** Existing approved entries don't have `evidenceMeta`. Code accessing `entry.evidenceMeta.evidenceLevel` crashes.

**Why it happens:** Migration oversight -- new field on existing records.

**How to avoid:** Default `evidenceMeta` to `null` and check before access. Admin views should highlight "missing evidence" entries. Provide batch action to assign default evidence to legacy entries.

**Warning signs:** 500 errors on retrieval after deployment.

### Pitfall 2: Evidence Not Updated on Content Change

**What goes wrong:** Entry is updated with new content but `evidenceMeta.verifiedAt` stays old, making it appear verified when it's stale.

**Why it happens:** Update flow doesn't touch evidence metadata.

**How to avoid:** On content update, either (a) require re-verification with new evidence, or (b) clear/reset evidence to `anecdotal` level. Document the chosen behavior.

**Warning signs:** High-level evidence on clearly outdated content.

### Pitfall 3: Inconsistent Evidence Between Knowledge and Skill Artifacts

**What goes wrong:** Knowledge entries get evidence metadata but skill artifacts don't, creating inconsistent trust visibility.

**Why it happens:** Implementing only on one record type.

**How to avoid:** Apply `EvidenceMeta` to both `KnowledgeRecord` and `SkillArtifactRecord` from the start. Use the same schema for both.

**Warning signs:** Skill search results show no evidence while trap results do.

### Pitfall 4: Overly Complex Evidence Levels

**What goes wrong:** Too many evidence levels create confusion and inconsistent application.

**Why it happens:** Trying to capture every nuance of verification strength.

**How to avoid:** Start with 4 levels: `anecdotal`, `reproduced`, `documented`, `verified-in-prod`. Add more only when clear need emerges.

**Warning signs:** Reviewers struggle to pick the right level; inconsistent assignments.

## Code Examples

### Evidence Schema (contracts pattern)

```typescript
// Source: pattern from packages/contracts/src/domain/decay.ts
import { z } from 'zod';
import { actorRefSchema, isoTimestampSchema } from './common.js';

export const evidenceSourceTypeSchema = z.enum([
  'internal-experience',
  'incident',
  'doc',
  'code',
  'external-reference',
]);

export const evidenceLevelSchema = z.enum([
  'anecdotal',
  'reproduced',
  'documented',
  'verified-in-prod',
]);

export const evidenceMetaSchema = z.object({
  sourceType: evidenceSourceTypeSchema,
  sourceRef: z.string().max(500).optional(),
  evidenceLevel: evidenceLevelSchema,
  verifiedAt: isoTimestampSchema,
  verifiedBy: actorRefSchema,
});

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
```

### Store Record Extension (server pattern)

```typescript
// Source: pattern from packages/server/src/lib/store.ts decayMeta addition
import type { EvidenceMeta } from '@trapmap/contracts';

export interface KnowledgeRecord {
  // ... existing fields
  /** Decay state metadata for lifecycle management */
  decayMeta: DecayMeta | null;
  /** Evidence and provenance metadata (null for legacy entries) */
  evidenceMeta: EvidenceMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillArtifactRecord {
  // ... existing fields
  /** Decay state metadata for lifecycle management */
  decayMeta: DecayMeta | null;
  /** Evidence and provenance metadata (null for legacy entries) */
  evidenceMeta: EvidenceMeta | null;
  createdAt: string;
  updatedAt: string;
}
```

### Review Route Extension (server pattern)

```typescript
// Source: pattern from packages/server/src/routes/review.ts
import type { EvidenceMeta } from '@trapmap/contracts';

app.post('/v1/knowledge/review', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:review');

  const payload = reviewDecisionRequestSchema.parse(request.body);

  const reviewedEntry = await app.skillShareer.store.transact((data) => {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === payload.entryId);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    // ... existing validation ...

    applyReviewDecision({
      store: app.skillShareer.store,
      data,
      entry,
      reviewerUserId: decidedByUserId,
      decidedAt,
      decision: payload.decision,
      notes: payload.notes,
      evidence: payload.evidence, // NEW: pass evidence metadata
    });

    // Record audit event with evidence
    const auditEvent = createAuditEvent({
      store: app.skillShareer.store,
      data,
      teamId: entry.teamId,
      actor: auth,
      action: 'knowledge-reviewed',
      entityId: entry.id,
      payload: {
        decision: payload.decision,
        notes: payload.notes,
        previousState,
        evidence: payload.evidence, // NEW: include in audit
      },
    });
    data.auditEvents.push(auditEvent);

    return toKnowledgeEntry(data, entry);
  });

  return { entry: reviewedEntry };
});
```

### Retrieval Response Extension (contracts pattern)

```typescript
// Source: pattern from packages/contracts/src/domain/retrieval.ts
export const evidenceHintSchema = z.object({
  evidenceLevel: evidenceLevelSchema,
  verifiedAt: isoTimestampSchema,
  sourceType: evidenceSourceTypeSchema,
});

// Add to capsule match
export const capsuleMatchSchema = z.object({
  capsuleId: entityIdSchema,
  artifactId: entityIdSchema,
  // ... existing fields
  /** Evidence metadata when available */
  evidence: evidenceHintSchema.optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Knowledge trust implied by approval | Explicit evidence metadata | This phase | Users can see verification strength |
| No provenance tracking | Source type and reference | This phase | Knowledge origin is transparent |
| Admin cannot filter by trust level | Evidence-level filtering | This phase | Corpus health is queryable |

**Deprecated/outdated:**
- None in this phase -- this is a greenfield feature addition

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 4 evidence levels are sufficient | Pattern 1 | Low -- levels are extensible without breaking changes |
| A2 | Evidence belongs on both Knowledge and Skill records | Pattern 1 | Low -- unified vocabulary simplifies governance |
| A3 | Review flow is the right capture point | Pattern 2 | Low -- consistent with existing approval patterns |
| A4 | Compact hints are sufficient for retrieval | Pattern 3 | Low -- full details available via detail endpoints |
| A5 | Evidence can default to `anecdotal` when not provided | Pattern 2 | Medium -- may reduce trust signal value |

## Open Questions

1. **Should evidence metadata be required for approval?**
   - What we know: Reviewers can approve without providing evidence.
   - What's unclear: Whether missing evidence should block approval or just be flagged.
   - Recommendation: Start optional, allow admin to query "missing evidence" entries, consider making required in v2 based on usage patterns.

2. **How does evidence interact with content updates?**
   - What we know: Content can be updated after approval via resubmission.
   - What's unclear: Whether evidence should be reset/cleared on content change.
   - Recommendation: On resubmission, preserve evidence but update `verifiedAt` only on re-approval. This aligns with the review flow pattern.

3. **Should evidence level affect retrieval ranking?**
   - What we know: Retrieval already considers decay state for ranking.
   - What's unclear: Whether `evidenceLevel` should boost/penalize scores.
   - Recommendation: Defer to Phase 54 (Boundary-aware Retrieval) where ranking boosts are explicitly designed. Keep Phase 58 focused on metadata and visibility.

4. **How to handle evidence for migrated legacy knowledge?**
   - What we know: Legacy knowledge entries exist without evidence metadata.
   - What's unclear: Whether to backfill default evidence or leave null.
   - Recommendation: Leave null for Phase 58. Provide batch action in Phase 50 (Batch Management) to assign default evidence to selected entries.

## Integration with Other Phases

### Phase 48 (Lifecycle State Machine) - COMPLETE

- `DecayMeta.lastVerifiedAt` serves lifecycle purposes
- `EvidenceMeta.verifiedAt` serves trust purposes
- Both can coexist; they may have different values
- `DecayMeta` already added to `KnowledgeRecord` and `SkillArtifactRecord`

### Phase 51 (Boundary Schema Definition) - PENDING

- Boundary evidence layer captures constraint-level provenance
- Phase 58 captures entry-level provenance
- Both use similar vocabulary but serve different scopes
- Consider shared enum imports from `evidence.ts`

### Phase 50 (Batch Management Interface) - PENDING

- Batch actions can include "assign evidence" operation
- List views can filter by evidence status
- Missing evidence is a useful triage dimension

### Phase 59 (Ownership & Verification SLA Management) - PENDING

- `EvidenceMeta.verifiedAt` feeds into review-due scheduling
- `verifiedBy` provides ownership trail
- Re-verification action can update evidence metadata

## Environment Availability

No new external dependencies identified. This phase uses only existing packages: zod, vitest, existing server infrastructure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 |
| Config file | packages/server/vitest.config.ts |
| Quick run command | `pnpm --filter @trapmap/server test -- --reporter=verbose` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Status |
|--------|----------|-----------|-------------------|-------------|
| EVIDENCE-01 | Evidence schema validation | unit | `pnpm --filter @trapmap/contracts test` | Wave 0 (new) |
| EVIDENCE-01 | Evidence persisted on approval | unit | `pnpm --filter @trapmap/server test -- lib/knowledge.test.ts` | Wave 0 (extend) |
| EVIDENCE-01 | Evidence on both record types | unit | `pnpm --filter @trapmap/server test -- lib/store.test.ts` | Wave 0 (extend) |
| EVIDENCE-02 | Evidence in retrieval response | unit | `pnpm --filter @trapmap/server test -- lib/retrieval/` | Wave 0 (extend) |
| EVIDENCE-02 | Evidence queryable in admin views | unit | `pnpm --filter @trapmap/server test -- routes/operations.test.ts` | Wave 0 (extend) |
| EVIDENCE-02 | Evidence in audit trail | unit | `pnpm --filter @trapmap/server test -- lib/audit.test.ts` | Wave 0 (extend) |

### Wave 0 Gaps
- [ ] `packages/contracts/src/domain/evidence.ts` -- new file for evidence schemas
- [ ] `packages/server/src/lib/evidence/model.ts` -- evidence validation helpers
- [ ] `packages/server/src/lib/evidence/model.test.ts` -- evidence validation tests
- [ ] Extend `packages/server/src/routes/review.test.ts` -- evidence in review decision
- [ ] Extend `packages/server/src/routes/retrieval.test.ts` -- evidence in response
- [ ] Extend `packages/cli/src/commands/knowledge.test.ts` -- CLI evidence flags

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing session system handles auth |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | Evidence update requires reviewer permission |
| V5 Input Validation | yes | Zod validates all evidence fields |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for Evidence Metadata

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Evidence manipulation (claiming higher verification than performed) | Tampering | Reviewer permission required; audit trail captures all changes |
| False provenance (fabricating source references) | Spoofing | Source references are informational only; trust relies on reviewer reputation |
| Evidence deletion (removing evidence to hide untrustworthy knowledge) | Tampering | Evidence changes are audit-logged; admin can detect removal patterns |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/contracts/src/domain/decay.ts` -- existing DecayMeta pattern
- Codebase analysis: `packages/contracts/src/domain/knowledge.ts` -- knowledge entry contracts
- Codebase analysis: `packages/contracts/src/domain/artifacts.ts` -- skill artifact contracts
- Codebase analysis: `packages/contracts/src/domain/retrieval.ts` -- retrieval response schemas
- Codebase analysis: `packages/server/src/routes/review.ts` -- review flow implementation
- Codebase analysis: `packages/server/src/lib/store.ts` -- record types
- Codebase analysis: `packages/server/src/lib/audit.ts` -- audit infrastructure
- Codebase analysis: `.planning/milestones/v1.5-phases/58-CONTEXT.md` -- phase context
- Codebase analysis: `.planning/milestones/v1.5-phases/51-CONTEXT.md` -- boundary evidence alignment
- Codebase analysis: `.planning/phases/48-lifecycle-state-machine/48-RESEARCH.md` -- Phase 48 patterns

### Secondary (MEDIUM confidence)
- Phase 48 patterns for metadata field addition
- Existing review flow for capture integration
- Retrieval response patterns for additive fields

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; reuses existing zod/vitest
- Architecture: HIGH - extends existing patterns in review, store, and retrieval
- Pitfalls: HIGH - derived from analysis of existing code paths and integration points

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable -- patterns are codebase-internal, not ecosystem-dependent)
