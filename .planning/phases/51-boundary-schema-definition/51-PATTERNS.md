# Phase 51: Boundary Schema Definition - Pattern Mapping

**Created:** 2026-05-02
**Phase:** 51
**Requirement:** BOUND-01

---

## File Classification

### Classification Matrix

| File | Role | Data Flow | Action |
|------|------|-----------|--------|
| `packages/contracts/src/domain/boundary.ts` | Schema Definition | Source of truth for Boundary types | NEW |
| `packages/contracts/src/domain/boundary.test.ts` | Schema Validation | Test contract enforcement | NEW |
| `packages/contracts/src/index.ts` | Barrel Export | Re-export for consumers | MODIFY |
| `packages/server/src/lib/store.ts` | Persistence Record | Store Boundary on records | MODIFY |
| `packages/server/src/lib/governance/types.ts` | Governance Interface | Future retrieval filtering | MODIFY |

---

## Pattern 1: Domain Schema File (NEW)

**Target:** `packages/contracts/src/domain/boundary.ts`
**Reference:** `packages/contracts/src/domain/decay.ts`

### Reference Excerpt

```typescript
import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

/**
 * Decay state for knowledge lifecycle management.
 *
 * States transition based on age and configuration thresholds:
 * - active: Fresh, recently verified knowledge
 * - review-due: Age >= reviewDueDays, needs human review
 * - stale: Age >= staleDays, relevance diminished
 * - expired: Age >= expireDays, should be retired
 * - superseded: Replaced by newer knowledge (regardless of age)
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
 *
 * All day thresholds must be between 1 and 3650 (10 years max).
 * The feature is disabled by default for safe rollout.
 */
export const decayConfigSchema = z.object({
  /** Days before entry needs review */
  reviewDueDays: z.number().int().min(1).max(3650).default(90),
  /** Days before entry is considered stale */
  staleDays: z.number().int().min(1).max(3650).default(180),
  /** Days before entry expires */
  expireDays: z.number().int().min(1).max(3650).default(365),
  /** Whether decay feature is enabled */
  enabled: z.boolean().default(false),
});

/**
 * Metadata for tracking decay state on knowledge entries and skill artifacts.
 *
 * Persists the last verification time and computed decay state.
 * Superseded entries track their replacement via supersededById.
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

### Pattern Elements to Apply

1. **Import structure**: Zod first, then base types from `./common.js`
2. **JSDoc comments**: Block comment for schema purpose, inline for each field
3. **Enum-first definition**: Define enums before objects that use them
4. **Default values**: Use `.default()` for optional fields
5. **Nullable fields**: Use `.nullable().default(null)` for nullable with explicit null default
6. **Type exports**: Export inferred types at bottom

### Boundary-Specific Adaptations

```typescript
// Follow common.ts patterns for string constraints and enums
// Example from common.ts:
export const lifecycleStateSchema = z.enum([
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
]);

export const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9:_/-]+$/i, 'labels may only contain letters, numbers, :, _, /, or -');
```

---

## Pattern 2: Schema Test File (NEW)

**Target:** `packages/contracts/src/domain/boundary.test.ts`
**Reference:** `packages/contracts/src/domain/plans.test.ts`

### Reference Excerpt

```typescript
import { describe, expect, it } from 'vitest';
import {
  graphPlanEdgeTypeSchema,
  graphPlanNodeSchema,
  // ... other imports
} from './plans.js';

describe('plans schema contracts', () => {
  describe('planEdgeTypeSchema', () => {
    it('accepts valid plan edge types', () => {
      expect(planEdgeTypeSchema.parse('risk-blocks')).toBe('risk-blocks');
      expect(planEdgeTypeSchema.parse('mitigates')).toBe('mitigates');
      expect(planEdgeTypeSchema.parse('requires')).toBe('requires');
      expect(planEdgeTypeSchema.parse('order')).toBe('order');
    });

    it('rejects invalid plan edge types like co-occurs-with', () => {
      expect(() => planEdgeTypeSchema.parse('co-occurs-with')).toThrow();
    });
  });

  describe('planTrapNodeSchema', () => {
    it('requires nodeId, sourceId, label, severity, scope, requiredLevel, evidence, score', () => {
      const trap = planTrapNodeSchema.parse({
        nodeId: 'trap:entry-1',
        sourceId: 'entry-1',
        label: 'Memory corruption on concurrent access',
        severity: 'hard',
        scope: 'global',
        requiredLevel: 5,
        evidence: 'Pattern of concurrent modification without locking detected in module X',
        score: 0.92,
      });

      expect(trap.nodeId).toBe('trap:entry-1');
      expect(trap.severity).toBe('hard');
      expect(trap.scope).toBe('global');
      expect(trap.requiredLevel).toBe(5);
    });

    it('rejects missing governance fields', () => {
      expect(() =>
        planTrapNodeSchema.parse({
          nodeId: 'trap:entry-1',
          sourceId: 'entry-1',
          label: 'Test',
          severity: 'hard',
          // missing scope, requiredLevel, evidence, score
        }),
      ).toThrow();
    });
  });

  describe('trapFirstPlanSchema', () => {
    it('defaults to empty arrays when no fields provided', () => {
      const plan = trapFirstPlanSchema.parse({});

      expect(plan.blockingTraps).toEqual([]);
      expect(plan.recommendedSkills).toEqual([]);
      expect(plan.edges).toEqual([]);
      expect(plan.citations).toEqual([]);
    });
  });
});
```

### Pattern Elements to Apply

1. **Vitest imports**: `describe, expect, it` from 'vitest'
2. **Nested describes**: Group by schema being tested
3. **Positive tests first**: "accepts valid X" before "rejects invalid X"
4. **Parse and assert**: Use `.parse()` then assert on returned value
5. **Exception testing**: Use `expect(() => schema.parse(...)).toThrow()`
6. **Default testing**: Verify `.default()` behavior with empty input `{}`
7. **Complete object testing**: Test fully populated boundary

### Required Test Cases for Boundary

| Schema | Test Case |
|--------|-----------|
| `versionConstraintSchema` | Accepts valid semver range |
| `versionConstraintSchema` | Rejects empty package name |
| `boundaryConditionSchema` | Accepts required condition |
| `boundaryConditionSchema` | Defaults required=true |
| `signalMatcherSchema` | Accepts each kind enum value |
| `signalMatcherSchema` | Defaults kind='keyword' |
| `exclusionRuleSchema` | Accepts valid exclusion |
| `evidenceReferenceSchema` | Accepts valid URL |
| `evidenceReferenceSchema` | Allows optional URL |
| `boundarySchema` | Defaults all layers to empty arrays |
| `boundarySchema` | Accepts complete boundary with all layers |

---

## Pattern 3: Barrel Export (MODIFY)

**Target:** `packages/contracts/src/index.ts`
**Reference:** Same file, existing pattern

### Reference Excerpt

```typescript
export * from './domain/artifacts.js';
export * from './domain/auth.js';
export * from './domain/candidates.js';
export * from './domain/common.js';
export * from './domain/decay.js';
export * from './domain/evals/retrieval.js';
// ... more exports
export * from './domain/plans.js';
export * from './domain/team.js';

// Re-export specific types for Phase 35 resolution workflow
export type {
  ResolutionOutcome,
  EntityLineage,
  ApplyResolutionResponse,
} from './domain/candidates.js';

export {
  ResolutionOutcomeSchema,
  EntityLineageSchema,
  applyResolutionResponseSchema,
} from './domain/candidates.js';
```

### Modification Required

Add after `export * from './domain/decay.js';` (alphabetically sorted):

```typescript
export * from './domain/boundary.js';
```

**Placement:** Insert between `artifacts.js` and `candidates.js` alphabetically, or after `decay.js` to follow phase ordering pattern.

---

## Pattern 4: Record Type Extension (MODIFY)

**Target:** `packages/server/src/lib/store.ts`
**Reference:** Same file, Phase 48 DecayMeta addition

### Reference Excerpt

```typescript
import type {
  CandidateSubmission,
  DecayMeta,  // Added in Phase 48
  DuplicateCase,
  LifecycleState,
  Permission,
  RoleTemplate,
  Scope,
  ScriptActivationPolicy,
} from '@trapmap/contracts';

// ...

export interface KnowledgeRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: KnowledgeRevisionRecord;
  history: KnowledgeRevisionRecord[];
  metadata: KnowledgeMetadataRecord;
  latestSubmissionId: string | null;
  submissionHistory: KnowledgeSubmissionRecord[];
  agentReview: AgentReviewRecord | null;
  reviewHistory: KnowledgeReviewDecisionRecord[];
  reviewNotes: KnowledgeReviewNoteRecord[];
  lifecycleHistory: KnowledgeLifecycleEventRecord[];
  /** Cached embedding for retrieval (null if not yet computed) */
  embeddingCache: EmbeddingCacheRecord | null;
  /** Index state for lifecycle-driven indexing (null if not yet indexed) */
  indexState: KnowledgeIndexStateRecord | null;
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;  // Added in Phase 48
  createdAt: string;
  updatedAt: string;
}

// ...

export interface SkillArtifactRecord {
  // ... many fields ...
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;  // Added in Phase 48
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}
```

### Modification Required

1. **Add import**:
```typescript
import type {
  Boundary,  // NEW
  CandidateSubmission,
  DecayMeta,
  // ... rest
} from '@trapmap/contracts';
```

2. **Add to KnowledgeRecord** (after decayMeta, before createdAt):
```typescript
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
```

3. **Add to SkillArtifactRecord** (after decayMeta, before createdAt):
```typescript
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
```

### Nullable Field Pattern

- Use `| null` not `| undefined`
- Add JSDoc comment with phase reference
- Place before timestamp fields (createdAt, updatedAt)
- Nullable for backward compatibility and explicit "no boundary" distinction

---

## Pattern 5: Governance Interface Extension (MODIFY)

**Target:** `packages/server/src/lib/governance/types.ts`
**Reference:** Same file, Phase 48 decayState addition

### Reference Excerpt

```typescript
/**
 * Shared governance types for unified eligibility checking.
 * Used by both KnowledgeEntry (trap) and SkillArtifact domains.
 */

import type { DecayState, LifecycleState, Scope, SecurityLevel } from '@trapmap/contracts';

/**
 * Governance context representing the caller's access rights.
 * Extracted from ResolvedAuthContext for governance decisions.
 */
export interface GovernanceContext {
  /** Active team ID (null for global-only access) */
  teamId: string | null;
  /** Caller's security level (0-10) */
  securityLevel: SecurityLevel;
  /** Whether caller is system admin with full access */
  isSystemAdmin: boolean;
}

/**
 * Common governance properties shared by KnowledgeEntry and SkillArtifact.
 * Both domains must implement these for unified eligibility checking.
 */
export interface GovernedEntity {
  /** Team ID for project-scoped entities, null for global */
  teamId: string | null;
  /** Entity scope: global or project */
  scope: Scope;
  /** Minimum security level required to access */
  requiredLevel: SecurityLevel;
  /** Current lifecycle state (only 'approved' is eligible for retrieval) */
  lifecycleState: LifecycleState;
  /** Computed decay state (only meaningful when lifecycleState is 'approved') */
  decayState?: DecayState;  // Added in Phase 48
}
```

### Modification Required

1. **Add import**:
```typescript
import type { Boundary, DecayState, LifecycleState, Scope, SecurityLevel } from '@trapmap/contracts';
```

2. **Add to GovernedEntity** (after decayState):
```typescript
  /** Boundary constraints for retrieval filtering (Phase 51) */
  boundary?: Boundary | null;
```

### Optional vs Nullable Pattern

- Use `?: ... | null` for optional property that can be null
- Matches `decayState?: DecayState;` pattern
- JSDoc comment explains purpose and phase reference
- Future phases (BOUND-04) will use this for retrieval filtering

---

## String Constraints Summary

From `common.ts` patterns to apply in `boundary.ts`:

| Field Type | Constraint Pattern |
|------------|-------------------|
| Package name | `z.string().min(1).max(128)` |
| Version range | `z.string().min(1).max(64)` |
| Description/note | `z.string().min(1).max(280)` |
| Pattern | `z.string().min(1).max(500)` |
| Identifier | `z.string().min(1).max(128)` |
| URL | `z.string().url().max(512)` |
| Context label | `z.string().min(1).max(64)` |

---

## Enum Definitions Summary

From `common.ts` pattern, enums to define in `boundary.ts`:

| Enum | Values |
|------|--------|
| `ConditionKind` | `'environment' \| 'permission' \| 'tool' \| 'configuration' \| 'other'` |
| `SignalKind` | `'exact' \| 'keyword' \| 'regex' \| 'error-code' \| 'log-pattern'` |
| `ExclusionKind` | `'platform' \| 'version' \| 'context' \| 'configuration' \| 'other'` |
| `EvidenceKind` | `'issue' \| 'incident' \| 'cve' \| 'documentation' \| 'test' \| 'commit' \| 'other'` |

---

## Array Length Limits

From RESEARCH.md recommendations:

| Layer | Max Items |
|-------|-----------|
| context | 10 |
| versions | 10 |
| prerequisites | 10 |
| signals | 20 |
| exclusions | 10 |
| evidence | 10 |

Apply with: `z.array(schema).max(N).default([])`

---

## Checklist for Implementation

- [ ] Create `boundary.ts` following decay.ts pattern
- [ ] Define 6 sub-schemas before main boundarySchema
- [ ] Add JSDoc comments for all schemas and fields
- [ ] Export all inferred types at bottom
- [ ] Create `boundary.test.ts` following plans.test.ts pattern
- [ ] Test all 6 sub-schemas individually
- [ ] Test boundarySchema defaults and complete object
- [ ] Add barrel export in index.ts
- [ ] Add Boundary import in store.ts
- [ ] Add boundary field to KnowledgeRecord
- [ ] Add boundary field to SkillArtifactRecord
- [ ] Add Boundary import in governance/types.ts
- [ ] Add boundary field to GovernedEntity

---

*Pattern mapping complete: 2026-05-02*
