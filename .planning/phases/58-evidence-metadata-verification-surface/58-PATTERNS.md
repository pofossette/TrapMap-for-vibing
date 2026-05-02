# Phase 58: Evidence Metadata & Verification Surface - Pattern Mapping

**Phase:** 58
**Generated:** 2026-05-02
**Source:** 58-RESEARCH.md

## Files to Create/Modify

| File | Role | Action | Analog Source |
|------|------|--------|---------------|
| `packages/contracts/src/domain/evidence.ts` | Schema | CREATE | `decay.ts` |
| `packages/contracts/src/domain/knowledge.ts` | Schema | EXTEND | existing file |
| `packages/contracts/src/domain/artifacts.ts` | Schema | EXTEND | existing file |
| `packages/contracts/src/domain/retrieval.ts` | Schema | EXTEND | `capsuleMatchSchema` pattern |
| `packages/contracts/src/domain/review.ts` | Schema | EXTEND | `reviewDecisionRequestSchema` |
| `packages/server/src/lib/evidence/model.ts` | Logic | CREATE | `lib/knowledge.ts` helpers |
| `packages/server/src/lib/knowledge.ts` | Logic | EXTEND | `applyReviewDecision` |
| `packages/server/src/lib/store.ts` | Data | EXTEND | `decayMeta` field pattern |
| `packages/server/src/routes/review.ts` | Route | EXTEND | existing review flow |
| `packages/server/src/routes/retrieval.ts` | Route | EXTEND | capsule response pattern |
| `packages/server/src/routes/operations.ts` | Route | EXTEND | admin query patterns |
| `packages/cli/src/commands/review.ts` | CLI | EXTEND | review command pattern |

---

## Pattern 1: Domain Schema with Enum and Metadata Object

**Role:** New domain schema for evidence metadata
**Analog:** `packages/contracts/src/domain/decay.ts`
**Data Flow:** Contracts → Server → CLI

### Source Excerpt (decay.ts)

```typescript
import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

/**
 * Decay state for knowledge lifecycle management.
 */
export const decayStateSchema = z.enum([
  'active',
  'review-due',
  'stale',
  'expired',
  'superseded',
]);

/**
 * Configuration for decay state transitions.
 */
export const decayConfigSchema = z.object({
  reviewDueDays: z.number().int().min(1).max(3650).default(90),
  staleDays: z.number().int().min(1).max(3650).default(180),
  expireDays: z.number().int().min(1).max(3650).default(365),
  enabled: z.boolean().default(false),
});

/**
 * Metadata for tracking decay state on knowledge entries and skill artifacts.
 */
export const decayMetaSchema = z.object({
  /** When this entry was last verified by a human */
  lastVerifiedAt: isoTimestampSchema,
  /** Current computed decay state */
  decayState: decayStateSchema,
  /** ID of the entry that supersedes this one, if any */
  supersededById: entityIdSchema.nullable().default(null),
  /** When the decay state was last computed */
  decayStateComputedAt: isoTimestampSchema,
});

export type DecayState = z.infer<typeof decayStateSchema>;
export type DecayConfig = z.infer<typeof decayConfigSchema>;
export type DecayMeta = z.infer<typeof decayMetaSchema>;
```

### Pattern to Apply (evidence.ts)

```typescript
// packages/contracts/src/domain/evidence.ts
import { z } from 'zod';

import { actorRefSchema, isoTimestampSchema } from './common.js';

/**
 * Source type vocabulary for knowledge provenance.
 */
export const evidenceSourceTypeSchema = z.enum([
  'internal-experience',
  'incident',
  'doc',
  'code',
  'external-reference',
]);

/**
 * Evidence strength level indicating verification rigor.
 */
export const evidenceLevelSchema = z.enum([
  'anecdotal',
  'reproduced',
  'documented',
  'verified-in-prod',
]);

/**
 * Minimal evidence and provenance metadata.
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

/** Compact evidence hint for retrieval responses */
export const evidenceHintSchema = z.object({
  evidenceLevel: evidenceLevelSchema,
  verifiedAt: isoTimestampSchema,
  sourceType: evidenceSourceTypeSchema,
});

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
export type EvidenceHint = z.infer<typeof evidenceHintSchema>;
```

---

## Pattern 2: Nullable Metadata Field on Record Types

**Role:** Add nullable evidence metadata to knowledge and skill records
**Analog:** `packages/server/src/lib/store.ts` (decayMeta field)
**Data Flow:** Store → Routes → Contracts

### Source Excerpt (store.ts KnowledgeRecord)

```typescript
export interface KnowledgeRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  // ... other fields ...
  /** Index state for lifecycle-driven indexing (null if not yet indexed) */
  indexState: KnowledgeIndexStateRecord | null;
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  createdAt: string;
  updatedAt: string;
}
```

### Source Excerpt (store.ts SkillArtifactRecord)

```typescript
export interface SkillArtifactRecord {
  // ... other fields ...
  /** Lifecycle event history */
  lifecycleHistory: SkillArtifactLifecycleEventRecord[];
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}
```

### Pattern to Apply

```typescript
// In KnowledgeRecord interface
export interface KnowledgeRecord {
  // ... existing fields ...
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  /** Evidence and provenance metadata (null for legacy entries) */
  evidenceMeta: EvidenceMeta | null;
  createdAt: string;
  updatedAt: string;
}

// In SkillArtifactRecord interface
export interface SkillArtifactRecord {
  // ... existing fields ...
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  /** Evidence and provenance metadata (null for legacy entries) */
  evidenceMeta: EvidenceMeta | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## Pattern 3: Schema Extension on Request

**Role:** Extend review decision request to accept evidence
**Analog:** `packages/contracts/src/domain/review.ts` (reviewDecisionRequestSchema)
**Data Flow:** CLI → Route → Logic

### Source Excerpt (review.ts)

```typescript
import { z } from 'zod';

import {
  actorRefSchema,
  entityIdSchema,
  lifecycleStateSchema,
  paginatedQuerySchema,
} from './common.js';

export const reviewDecisionRequestSchema = z.object({
  entryId: entityIdSchema,
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
});
```

### Pattern to Apply

```typescript
// Extended review decision request
import { evidenceMetaSchema } from './evidence.js';

export const reviewDecisionRequestSchema = z.object({
  entryId: entityIdSchema,
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
  /** Optional evidence metadata (recommended for approval) */
  evidence: evidenceMetaSchema.optional(),
});
```

---

## Pattern 4: Additive Field on Retrieval Response

**Role:** Add compact evidence hint to retrieval match schemas
**Analog:** `packages/contracts/src/domain/retrieval.ts` (capsuleMatchSchema)
**Data Flow:** Route → Contracts → Client

### Source Excerpt (retrieval.ts capsuleMatchSchema)

```typescript
export const capsuleMatchSchema = z.object({
  /** Capsule identifier */
  capsuleId: entityIdSchema,
  /** Parent artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this capsule was derived from */
  revision: z.number().int().min(1),
  /** Source file paths that contributed to this capsule */
  sourcePaths: z.array(z.string().max(512)).min(1),
  /** Distilled capsule content */
  content: z.string().min(1).max(5000),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Optional error text for error-specific capsules */
  errorText: z.string().max(500).optional(),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
  /** Governance scope (inherited from artifact root) */
  scope: scopeSchema,
  /** Required security level (inherited from artifact root) */
  requiredLevel: securityLevelSchema,
  /** Final ranking score after all boosts applied */
  score: z.number().min(0).max(1),
  /** Human-readable explanation of why this capsule matched */
  reason: z.string().min(1),
});
```

### Pattern to Apply

```typescript
import { evidenceHintSchema } from './evidence.js';

export const capsuleMatchSchema = z.object({
  // ... existing fields ...
  /** Final ranking score after all boosts applied */
  score: z.number().min(0).max(1),
  /** Human-readable explanation of why this capsule matched */
  reason: z.string().min(1),
  /** Evidence metadata when available (additive, optional) */
  evidence: evidenceHintSchema.optional(),
});

// Also extend retrievalMatchSchema for v1 compatibility
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
  /** Evidence metadata when available (additive, optional) */
  evidence: evidenceHintSchema.optional(),
});
```

---

## Pattern 5: Review Decision Logic with Metadata Persistence

**Role:** Persist evidence metadata during review approval
**Analog:** `packages/server/src/lib/knowledge.ts` (applyReviewDecision)
**Data Flow:** Route → Logic → Store

### Source Excerpt (knowledge.ts applyReviewDecision)

```typescript
export function applyReviewDecision(args: {
  store: SkillShareerStore;
  data: StoreData;
  entry: KnowledgeRecord;
  reviewerUserId: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  notes: string;
}): KnowledgeRecord {
  const reviewDecision: KnowledgeReviewDecisionRecord = {
    decidedAt: args.decidedAt,
    decidedByUserId: args.reviewerUserId,
    decision: args.decision,
    notes: args.notes,
  };
  const note: KnowledgeReviewNoteRecord = {
    id: args.store.nextId(args.data, 'note'),
    createdAt: args.decidedAt,
    authorType: 'reviewer',
    authorUserId: args.reviewerUserId,
    message: args.notes,
  };
  const latestSubmission = args.entry.submissionHistory.at(-1);

  args.entry.reviewHistory.push(reviewDecision);
  args.entry.reviewNotes.push(note);
  args.entry.latestRevision.reviewNotes.push(note);
  args.entry.lifecycleState = args.decision === 'approve' ? 'approved' : 'rejected';
  args.entry.metadata.latestReviewedAt = args.decidedAt;
  args.entry.metadata.latestDecision = args.decision;
  args.entry.lifecycleHistory.push(
    createLifecycleEvent(args.store, args.data, {
      type: args.decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
      createdAt: args.decidedAt,
      actorUserId: args.reviewerUserId,
      submissionId: latestSubmission?.id ?? null,
      revision: args.entry.latestRevision.revision,
      state: args.entry.lifecycleState,
      note: args.notes,
    }),
  );

  if (latestSubmission) {
    latestSubmission.reviewerDecision = reviewDecision;
    latestSubmission.lifecycleState = args.entry.lifecycleState;
    latestSubmission.reviewNotes.push(note);
  }

  args.entry.updatedAt = args.decidedAt;

  return args.entry;
}
```

### Pattern to Apply

```typescript
import type { EvidenceMeta } from '@trapmap/contracts';

export function applyReviewDecision(args: {
  store: SkillShareerStore;
  data: StoreData;
  entry: KnowledgeRecord;
  reviewerUserId: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  notes: string;
  /** Optional evidence metadata (new field) */
  evidence?: EvidenceMeta;
}): KnowledgeRecord {
  // ... existing logic ...

  // NEW: On approval, persist evidence metadata
  if (args.decision === 'approve') {
    if (args.evidence) {
      args.entry.evidenceMeta = {
        ...args.evidence,
        verifiedAt: args.evidence.verifiedAt ?? args.decidedAt,
      };
    } else {
      // Default evidence when not explicitly provided
      const reviewerActorRef = toActorRef(
        args.data,
        args.reviewerUserId,
        args.entry.teamId,
        args.entry.requiredLevel,
      );
      args.entry.evidenceMeta = {
        sourceType: 'internal-experience',
        evidenceLevel: 'anecdotal',
        verifiedAt: args.decidedAt,
        verifiedBy: reviewerActorRef,
      };
    }
  }

  args.entry.updatedAt = args.decidedAt;
  return args.entry;
}
```

---

## Pattern 6: Route Handler with Extended Request

**Role:** Accept evidence in review route and pass to logic
**Analog:** `packages/server/src/routes/review.ts`
**Data Flow:** Request → Route → Logic

### Source Excerpt (review.ts route handler)

```typescript
app.post('/v1/knowledge/review', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:review');

  const payload = reviewDecisionRequestSchema.parse(request.body);

  // Capture transition context for post-commit indexing
  let entryId: string | undefined;
  let previousState: LifecycleState | undefined;
  let nextState: LifecycleState | undefined;

  const reviewedEntry = await app.skillShareer.store.transact((data) => {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === payload.entryId);

    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (entry.teamId) {
      requireTeamAccess(auth, entry.teamId);
    }

    requireHigherLevel(auth, entry.requiredLevel);

    const decidedByUserId =
      auth.user?.id ??
      (() => {
        throw new AppError(403, 'user_required', 'System admin cannot author review decisions');
      })();

    const decidedAt = nowIso();
    previousState = entry.lifecycleState;
    applyReviewDecision({
      store: app.skillShareer.store,
      data,
      entry,
      reviewerUserId: decidedByUserId,
      decidedAt,
      decision: payload.decision,
      notes: payload.notes,
    });

    // Capture entry ID and new state for post-commit indexing
    entryId = entry.id;
    nextState = entry.lifecycleState;

    // Record audit event
    const auditEvent = createAuditEvent({
      store: app.skillShareer.store,
      data,
      teamId: entry.teamId,
      actor: auth,
      action: 'knowledge-reviewed',
      entityId: entry.id,
      payload: { decision: payload.decision, notes: payload.notes, previousState },
    });
    data.auditEvents.push(auditEvent);

    return toKnowledgeEntry(data, entry);
  });

  // ... post-commit indexing ...

  return { entry: reviewedEntry };
});
```

### Pattern to Apply

```typescript
app.post('/v1/knowledge/review', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:review');

  const payload = reviewDecisionRequestSchema.parse(request.body);

  // ... existing validation ...

  const reviewedEntry = await app.skillShareer.store.transact((data) => {
    // ... existing entry lookup and validation ...

    const decidedAt = nowIso();
    previousState = entry.lifecycleState;

    // NEW: Pass evidence to applyReviewDecision
    applyReviewDecision({
      store: app.skillShareer.store,
      data,
      entry,
      reviewerUserId: decidedByUserId,
      decidedAt,
      decision: payload.decision,
      notes: payload.notes,
      evidence: payload.evidence, // NEW: optional evidence
    });

    // ... rest of existing logic ...

    // Record audit event (include evidence in payload)
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

  // ... post-commit indexing ...

  return { entry: reviewedEntry };
});
```

---

## Pattern 7: Admin Query with Filter Extensions

**Role:** Add evidence filters to admin list queries
**Analog:** `packages/contracts/src/domain/operations.ts` (knowledgeListRequestSchema)
**Data Flow:** CLI → Route → Store

### Source Excerpt (operations.ts knowledgeListRequestSchema)

```typescript
export const knowledgeListRequestSchema = z.object({
  scope: scopeSchema.optional(),
  lifecycleState: z.array(lifecycleStateSchema).optional(),
  requiredLevelMax: securityLevelSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});
```

### Pattern to Apply

```typescript
import { evidenceLevelSchema, evidenceSourceTypeSchema } from './evidence.js';

export const knowledgeListRequestSchema = z.object({
  scope: scopeSchema.optional(),
  lifecycleState: z.array(lifecycleStateSchema).optional(),
  requiredLevelMax: securityLevelSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  // NEW: Evidence-based filters
  evidenceLevel: z.array(evidenceLevelSchema).optional(),
  sourceType: z.array(evidenceSourceTypeSchema).optional(),
  verifiedBefore: isoTimestampSchema.optional(),
  verifiedAfter: isoTimestampSchema.optional(),
  missingEvidence: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});
```

---

## Pattern 8: CLI Command with Optional Flags

**Role:** Add evidence flags to CLI review command
**Analog:** `packages/cli/src/commands/review.ts`
**Data Flow:** User → CLI → API

### Source Excerpt (review.ts CLI command)

```typescript
for (const decision of ['approve', 'reject'] as const) {
  const decisionLabel = `${decision.slice(0, 1).toUpperCase()}${decision.slice(1)}`;

  program
    .command(`review:${decision}`)
    .description(`${decisionLabel} a queued knowledge entry`)
    .argument('<entryId>', 'Knowledge entry identifier')
    .requiredOption('--notes <text>', 'Reviewer notes')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: { json?: boolean; notes: string }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<KnowledgeEntryResponse>(state, {
        method: 'POST',
        path: '/v1/knowledge/review',
        body: {
          entryId,
          decision,
          notes: flags.notes,
        },
      });
      const parsed = knowledgeEntryResponseSchema.parse(response.data);

      printResult(parsed, flags, ({ entry }) =>
        [`${decision}d ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
      );
    });
}
```

### Pattern to Apply

```typescript
for (const decision of ['approve', 'reject'] as const) {
  const decisionLabel = `${decision.slice(0, 1).toUpperCase()}${decision.slice(1)}`;

  program
    .command(`review:${decision}`)
    .description(`${decisionLabel} a queued knowledge entry`)
    .argument('<entryId>', 'Knowledge entry identifier')
    .requiredOption('--notes <text>', 'Reviewer notes')
    // NEW: Evidence flags
    .option('--source-type <type>', 'Evidence source type (internal-experience|incident|doc|code|external-reference)')
    .option('--source-ref <ref>', 'Source reference (URL, doc ID, etc.)')
    .option('--evidence-level <level>', 'Evidence level (anecdotal|reproduced|documented|verified-in-prod)')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: {
      json?: boolean;
      notes: string;
      sourceType?: string;
      sourceRef?: string;
      evidenceLevel?: string;
    }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      // Build evidence object if any evidence flags provided
      const evidence = (flags.sourceType || flags.evidenceLevel) ? {
        sourceType: flags.sourceType ?? 'internal-experience',
        sourceRef: flags.sourceRef,
        evidenceLevel: flags.evidenceLevel ?? 'anecdotal',
        verifiedAt: new Date().toISOString(),
        verifiedBy: { id: '', handle: '', securityLevel: 0 }, // Server fills this
      } : undefined;

      const response = await apiRequest<KnowledgeEntryResponse>(state, {
        method: 'POST',
        path: '/v1/knowledge/review',
        body: {
          entryId,
          decision,
          notes: flags.notes,
          evidence, // NEW: optional evidence
        },
      });
      const parsed = knowledgeEntryResponseSchema.parse(response.data);

      printResult(parsed, flags, ({ entry }) =>
        [`${decision}d ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
      );
    });
}
```

---

## Pattern 9: Evidence in toKnowledgeEntry Mapping

**Role:** Include evidence metadata in contract output
**Analog:** `packages/server/src/lib/knowledge.ts` (toKnowledgeEntry)
**Data Flow:** Store → Contract → Response

### Source Excerpt (knowledge.ts toKnowledgeEntry)

```typescript
export function toKnowledgeEntry(data: StoreData, record: KnowledgeRecord) {
  const owner = toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel);
  const submissionHistory = toSubmissionRecord(data, record, record.requiredLevel);

  return knowledgeEntrySchema.parse({
    id: record.id,
    teamId: record.teamId,
    scope: record.scope,
    labels: record.labels,
    shortcut: record.shortcut,
    detail: record.detail,
    requiredLevel: record.requiredLevel,
    lifecycleState: record.lifecycleState,
    owner,
    latestRevision: toRevision(data, record.latestRevision, record.teamId, record.requiredLevel),
    history: record.history.map((revision) =>
      toRevision(data, revision, record.teamId, record.requiredLevel),
    ),
    metadata: record.metadata,
    latestSubmission: submissionHistory.at(-1) ?? null,
    submissionHistory,
    agentReview: record.agentReview,
    reviewHistory: record.reviewHistory.map((decision) =>
      toReviewDecision(data, decision, record.teamId, record.requiredLevel),
    ),
    reviewNotes: record.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, record.requiredLevel),
    ),
    lifecycleHistory: toLifecycleEvent(data, record, record.requiredLevel),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
```

### Pattern to Apply

```typescript
// First, extend knowledgeEntrySchema in contracts to include evidenceMeta
// Then in toKnowledgeEntry:

export function toKnowledgeEntry(data: StoreData, record: KnowledgeRecord) {
  // ... existing mapping ...

  return knowledgeEntrySchema.parse({
    // ... existing fields ...
    lifecycleHistory: toLifecycleEvent(data, record, record.requiredLevel),
    // NEW: Include evidence metadata
    evidenceMeta: record.evidenceMeta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
```

---

## Implementation Sequence

Based on dependencies, implement in this order:

1. **Wave 0: Contract Schemas**
   - Create `evidence.ts` with `evidenceMetaSchema`, `evidenceHintSchema`
   - Extend `knowledge.ts` to add `evidenceMeta` to `knowledgeEntrySchema`
   - Extend `artifacts.ts` to add `evidenceMeta` to `skillArtifactSchema`
   - Extend `review.ts` to add `evidence` to `reviewDecisionRequestSchema`
   - Extend `retrieval.ts` to add `evidence` to `capsuleMatchSchema` and `retrievalMatchSchema`
   - Extend `operations.ts` to add evidence filters to `knowledgeListRequestSchema`

2. **Wave 1: Server Data Layer**
   - Extend `store.ts` to add `evidenceMeta: EvidenceMeta | null` to record types
   - Create `lib/evidence/model.ts` for evidence validation helpers

3. **Wave 2: Server Logic**
   - Extend `lib/knowledge.ts` `applyReviewDecision` to persist evidence
   - Extend `toKnowledgeEntry` to include evidence metadata

4. **Wave 3: Routes**
   - Extend `routes/review.ts` to pass evidence to logic
   - Extend `routes/retrieval.ts` to include evidence in responses
   - Extend `routes/operations.ts` to support evidence filters

5. **Wave 4: CLI**
   - Extend `commands/review.ts` to accept evidence flags

---

## Testing Checklist

| Test | File | Pattern |
|------|------|---------|
| Evidence schema validation | `evidence.test.ts` | Pattern 1 |
| Evidence on approval | `knowledge.test.ts` | Pattern 5 |
| Evidence in retrieval response | `retrieval.test.ts` | Pattern 4 |
| Evidence query filters | `operations.test.ts` | Pattern 7 |
| CLI evidence flags | `review.test.ts` | Pattern 8 |
