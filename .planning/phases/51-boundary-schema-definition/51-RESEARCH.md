# Phase 51: Boundary Schema Definition - Research

**Gathered:** 2026-05-02
**Status:** Research complete
**Requirement:** BOUND-01

## Summary

Phase 51 requires defining a unified boundary schema with 6-layer structure (context, versions, prerequisites, signals, exclusions, evidence) that is shared across both trap and skill artifact types. This research identifies the key integration points, existing patterns to follow, and technical decisions needed for planning.

---

## 1. Requirement Analysis

### 1.1 BOUND-01 Requirement Statement

> Unified boundary schema shared across trap and skill artifacts with 6-layer structure (context / versions / prerequisites / signals / exclusions / evidence)

### 1.2 Success Criteria from Phase Description

1. Schema defines 6 boundary layers: context, versions, prerequisites, signals, exclusions, evidence
2. Each layer contains structured fields with defined types (string arrays, version ranges, condition objects)
3. Schema shared across trap and skill artifact types with no divergence
4. TypeScript types generated from schema with runtime validation

### 1.3 Scope Boundary

This phase is **schema definition only**. Subsequent phases handle:
- **BOUND-02 (Phase 52)**: Input/authoring workflow for boundaries
- **BOUND-03 (Phase 53)**: Indexing boundaries as facets and graph nodes
- **BOUND-04 (Phase 54)**: Retrieval filtering and ranking with boundaries
- **BOUND-05 (Phase 54)**: API boundary explanations in responses

---

## 2. Existing Schema Patterns

### 2.1 Shared Domain Model Location

All shared schemas live in `packages/contracts/src/domain/`:

| File | Content |
|------|---------|
| `common.ts` | Base types: `EntityId`, `SecurityLevel`, `Scope`, `Label`, `LifecycleState`, `ActorRef` |
| `knowledge.ts` | `KnowledgeEntry` and related submission/review schemas |
| `artifacts.ts` | `SkillArtifact`, `SkillProfile`, `SkillCapsule`, `ClientManifest` |
| `decay.ts` | `DecayState`, `DecayConfig`, `DecayMeta` (Phase 48) |
| `retrieval.ts` | Retrieval query/response schemas for v1/v2/v3 |

### 2.2 Schema Definition Pattern (from `decay.ts`)

```typescript
import { z } from 'zod';
import { entityIdSchema, isoTimestampSchema } from './common.js';

export const decayStateSchema = z.enum([
  'active',
  'review-due',
  'stale',
  'expired',
  'superseded',
]);

export const decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  supersededById: entityIdSchema.nullable().default(null),
  decayStateComputedAt: isoTimestampSchema,
});

export type DecayState = z.infer<typeof decayStateSchema>;
export type DecayMeta = z.infer<typeof decayMetaSchema>;
```

**Pattern elements:**
1. Zod import at top
2. Reuse base types from `./common.js`
3. Define enum schemas first (if any)
4. Define object schemas with defaults
5. Export inferred types at bottom
6. JSDoc comments for each field

### 2.3 Existing Boundary-Like Fields

**In `SkillProfile` (`artifacts.ts` lines 122-145):**
```typescript
export const skillProfileSchema = z.object({
  // ...
  /** Optional prerequisite list extracted from skill metadata */
  prerequisites: z.array(z.string().min(1).max(280)).default([]),
  // ...
});
```

**In SKILL.md fixtures (prose format, not structured):**
```markdown
Prerequisite: must understand JavaScript closures and React rendering model.
Requires adding all used variables to the dependency array.
```

**In `GovernedEntity` (`governance/types.ts` lines 25-34):**
```typescript
export interface GovernedEntity {
  teamId: string | null;
  scope: Scope;
  requiredLevel: SecurityLevel;
  lifecycleState: LifecycleState;
  decayState?: DecayState;  // Added in Phase 48
}
```

### 2.4 Schema Extension Pattern (from Phase 48)

Phase 48 added `DecayMeta` to both `KnowledgeRecord` and `SkillArtifactRecord`:

```typescript
// In store.ts
export interface KnowledgeRecord {
  // ... existing fields
  decayMeta: DecayMeta | null;  // Added field, nullable for backward compat
}
```

---

## 3. 6-Layer Boundary Structure Analysis

### 3.1 Layer Definitions

| Layer | Purpose | Example Values |
|-------|---------|----------------|
| **context** | Situational context where this knowledge applies | `"frontend"`, `"production"`, `"migration"`, `"CI/CD"` |
| **versions** | Version constraints for tools/libraries | `"react >= 16.8"`, `"node >= 18"`, `"typescript < 5.0"` |
| **prerequisites** | What must be true before applying | `"must have admin access"`, `"requires Docker installed"` |
| **signals** | Conditions that indicate this is relevant | `"error: ECONNREFUSED"`, `"slow query > 5s"`, `"memory leak pattern"` |
| **exclusions** | Conditions that make this NOT applicable | `"not for Windows"`, `"excludes SSR"`, `"only for monorepo"` |
| **evidence** | Supporting evidence for boundary assertions | `"issue #123"`, `"incident 2024-03-15"`, `"CVE-2024-1234"` |

### 3.2 Field Type Analysis

| Layer | Proposed Type | Rationale |
|-------|--------------|-----------|
| `context` | `string[]` | Simple categorical labels, already have `Label` pattern |
| `versions` | `VersionConstraint[]` | Need structured type for range semantics |
| `prerequisites` | `Condition[]` | Structured conditions with optional values |
| `signals` | `SignalMatcher[]` | Pattern matching for relevance detection |
| `exclusions` | `ExclusionRule[]` | Negation conditions |
| `evidence` | `EvidenceReference[]` | Structured references to supporting sources |

### 3.3 Proposed Schema Structure

```typescript
// Version constraint: "react >= 16.8.0"
export const versionConstraintSchema = z.object({
  /** Package/tool name */
  package: z.string().min(1).max(128),
  /** Version range (semver-compatible) */
  range: z.string().min(1).max(64),
  /** Optional note about why this constraint exists */
  note: z.string().max(280).optional(),
});

// Condition: prerequisite or requirement
export const boundaryConditionSchema = z.object({
  /** Human-readable condition description */
  description: z.string().min(1).max(280),
  /** Optional structured type hint */
  kind: z.enum(['environment', 'permission', 'tool', 'configuration', 'other']).optional(),
  /** Whether this is required (default) or optional */
  required: z.boolean().default(true),
});

// Signal matcher: pattern that indicates relevance
export const signalMatcherSchema = z.object({
  /** Pattern to match (regex, exact string, or keyword) */
  pattern: z.string().min(1).max(500),
  /** Pattern type for matching semantics */
  kind: z.enum(['exact', 'keyword', 'regex', 'error-code', 'log-pattern']).default('keyword'),
  /** Optional description of when this signal fires */
  description: z.string().max(280).optional(),
});

// Exclusion rule: condition that makes knowledge NOT apply
export const exclusionRuleSchema = z.object({
  /** Human-readable exclusion description */
  description: z.string().min(1).max(280),
  /** Category of exclusion */
  kind: z.enum(['platform', 'version', 'context', 'configuration', 'other']).optional(),
});

// Evidence reference: supporting source
export const evidenceReferenceSchema = z.object({
  /** Evidence type */
  kind: z.enum(['issue', 'incident', 'cve', 'documentation', 'test', 'commit', 'other']),
  /** Reference identifier (issue number, CVE ID, etc.) */
  identifier: z.string().min(1).max(128),
  /** Optional URL to source */
  url: z.string().url().max(512).optional(),
  /** Optional note about relevance */
  note: z.string().max(280).optional(),
});

// Unified boundary schema
export const boundarySchema = z.object({
  /** Situational context labels */
  context: z.array(z.string().min(1).max(64)).default([]),
  /** Version constraints */
  versions: z.array(versionConstraintSchema).default([]),
  /** Prerequisites that must be satisfied */
  prerequisites: z.array(boundaryConditionSchema).default([]),
  /** Signals indicating relevance */
  signals: z.array(signalMatcherSchema).default([]),
  /** Exclusion conditions */
  exclusions: z.array(exclusionRuleSchema).default([]),
  /** Supporting evidence */
  evidence: z.array(evidenceReferenceSchema).default([]),
});

export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type BoundaryCondition = z.infer<typeof boundaryConditionSchema>;
export type SignalMatcher = z.infer<typeof signalMatcherSchema>;
export type ExclusionRule = z.infer<typeof exclusionRuleSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type Boundary = z.infer<typeof boundarySchema>;
```

---

## 4. Integration Points

### 4.1 KnowledgeRecord Extension

```typescript
// In packages/server/src/lib/store.ts
export interface KnowledgeRecord {
  // ... existing fields
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
}
```

### 4.2 SkillArtifact Extension

```typescript
// In packages/server/src/lib/store.ts
export interface SkillArtifactRecord {
  // ... existing fields
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
}
```

### 4.3 GovernedEntity Extension (Future Phase)

For retrieval filtering (BOUND-04), `GovernedEntity` will need boundary access:

```typescript
// In packages/server/src/lib/governance/types.ts
export interface GovernedEntity {
  teamId: string | null;
  scope: Scope;
  requiredLevel: SecurityLevel;
  lifecycleState: LifecycleState;
  decayState?: DecayState;
  boundary?: Boundary | null;  // Phase 51 addition
}
```

### 4.4 Barrel Export

```typescript
// In packages/contracts/src/index.ts
export * from './domain/boundary.js';
```

---

## 5. Key Technical Decisions for Planning

### 5.1 Required Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Where to define boundary schema? | New file `boundary.ts` vs extend `common.ts` | **New file** - cleaner separation, follows Phase 48 pattern with `decay.ts` |
| Nullable or default empty? | `Boundary \| null` vs `Boundary` with defaults | **Nullable** - explicit opt-in, backward compatible, allows "no boundary" distinction |
| Version range format? | Semver string vs structured components | **Semver string** - standard format, existing tooling, parse on demand |
| Signal pattern types? | Fixed enum vs extensible string | **Fixed enum** - validation clarity, can extend later |
| Evidence URL required? | Required vs optional | **Optional** - not all evidence has URLs (e.g., internal incidents) |
| Max array lengths? | No limit vs explicit limits | **Explicit limits** - prevent abuse, consistent with existing patterns |

### 5.2 Deferred to Later Phases

| Question | Defers To |
|----------|-----------|
| How are boundaries authored? | BOUND-02 (Phase 52) |
| How are boundaries indexed? | BOUND-03 (Phase 53) |
| How are boundaries used in retrieval? | BOUND-04 (Phase 54) |
| Version range parsing logic | Phase 53 (indexing) or Phase 54 (retrieval) |
| Signal pattern matching | Phase 53 or Phase 54 |

---

## 6. Patterns to Follow

### 6.1 Zod Schema Definition Pattern

From `packages/contracts/src/domain/decay.ts`:
1. Import Zod at top
2. Reuse base types from `./common.js`
3. Define constituent schemas first (enums, sub-objects)
4. Define main schema with `.default()` for optional fields
5. Export inferred types at bottom
6. Add JSDoc comments for documentation

### 6.2 Nullable Field Pattern

From Phase 48's addition to `KnowledgeRecord`:
```typescript
decayMeta: DecayMeta | null;
```

This pattern:
- Allows backward compatibility with existing records
- Makes opt-in explicit (null = no boundary defined)
- Avoids empty-object vs missing-field ambiguity

### 6.3 String Constraints Pattern

From `packages/contracts/src/domain/common.ts`:
```typescript
export const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9:_/-]+$/i, 'labels may only contain letters, numbers, :, _, /, or -');
```

Apply similar constraints to context labels and other string fields.

### 6.4 Enum Definition Pattern

From `packages/contracts/src/domain/common.ts`:
```typescript
export const lifecycleStateSchema = z.enum([
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
]);
```

Use `z.enum()` for closed vocabularies with explicit type inference.

---

## 7. Anti-Patterns to Avoid

### 7.1 Diverging Schemas for Trap vs Skill

**Anti-pattern:** Creating separate `TrapBoundary` and `SkillBoundary` schemas.

**Why avoid:** BOUND-01 explicitly requires "shared across trap and skill artifact types with no divergence."

**Instead:** Single `Boundary` schema that applies to both `KnowledgeRecord` and `SkillArtifactRecord`.

### 7.2 Over-Engineering Pattern Matching

**Anti-pattern:** Full regex engine in `SignalMatcher`.

**Why avoid:** Security risk, complexity, overkill for v1.

**Instead:** Fixed enum of pattern kinds (`exact`, `keyword`, `regex`, `error-code`, `log-pattern`) with server-side validation.

### 7.3 Embedding Version Logic in Schema

**Anti-pattern:** Parsing semver ranges in Zod schema.

**Why avoid:** Schema should define shape, not business logic.

**Instead:** Store raw semver string, parse at indexing/retrieval time (Phase 53/54).

### 7.4 Required Fields Without Defaults

**Anti-pattern:** Required fields in `Boundary` without defaults.

**Why avoid:** Breaks backward compatibility, forces migration.

**Instead:** All fields default to empty arrays, `boundary` field on records is nullable.

---

## 8. Testing Strategy

### 8.1 Schema Validation Tests

Following pattern from `packages/contracts/src/domain/plans.test.ts`:

```typescript
describe('boundary schema contracts', () => {
  describe('versionConstraintSchema', () => {
    it('accepts valid semver ranges', () => {
      expect(versionConstraintSchema.parse({
        package: 'react',
        range: '>=16.8.0',
      })).toMatchObject({ package: 'react', range: '>=16.8.0' });
    });

    it('rejects empty package name', () => {
      expect(() => versionConstraintSchema.parse({
        package: '',
        range: '>=1.0.0',
      })).toThrow();
    });
  });

  describe('boundarySchema', () => {
    it('defaults all layers to empty arrays', () => {
      expect(boundarySchema.parse({})).toMatchObject({
        context: [],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      });
    });

    it('accepts complete boundary', () => {
      const boundary = boundarySchema.parse({
        context: ['frontend', 'production'],
        versions: [{ package: 'react', range: '>=16.8.0' }],
        prerequisites: [{ description: 'Admin access required' }],
        signals: [{ pattern: 'ECONNREFUSED', kind: 'error-code' }],
        exclusions: [{ description: 'Not for SSR' }],
        evidence: [{ kind: 'issue', identifier: '123' }],
      });
      expect(boundary.context).toHaveLength(2);
    });
  });
});
```

### 8.2 Test File Location

- New file: `packages/contracts/src/domain/boundary.test.ts`
- Follow existing pattern from `plans.test.ts`

---

## 9. Files to Create/Modify

### 9.1 New Files

| File | Purpose |
|------|---------|
| `packages/contracts/src/domain/boundary.ts` | Boundary schema definitions |
| `packages/contracts/src/domain/boundary.test.ts` | Schema validation tests |

### 9.2 Modified Files

| File | Changes |
|------|---------|
| `packages/contracts/src/index.ts` | Add `export * from './domain/boundary.js';` |
| `packages/server/src/lib/store.ts` | Add `boundary: Boundary \| null` to `KnowledgeRecord` and `SkillArtifactRecord` |
| `packages/server/src/lib/governance/types.ts` | Add `boundary?: Boundary \| null` to `GovernedEntity` (for future phases) |

---

## 10. Open Questions

### 10.1 For Planning Phase

1. **Context labels vs existing `labels` field:**
   - Knowledge entries already have `labels: string[]`
   - Should `context` layer reuse `labels` or be separate?
   - **Recommendation:** Keep separate. `labels` are for search categorization; `context` is for applicability constraints.

2. **Prerequisite vs version overlap:**
   - Version constraints are a type of prerequisite
   - Should versions be a separate layer or merged into prerequisites?
   - **Recommendation:** Keep separate per requirement. Versions have special parsing/matching needs.

3. **Max array lengths:**
   - What are reasonable limits for each layer?
   - **Recommendation:** Follow existing patterns (e.g., labels max 48 items). Suggest:
     - context: max 10
     - versions: max 10
     - prerequisites: max 10
     - signals: max 20
     - exclusions: max 10
     - evidence: max 10

### 10.2 Deferred to BOUND-02

- How boundaries are authored (manual input vs extracted)
- UI/UX for boundary input
- Validation of version ranges (semver parsing)

### 10.3 Deferred to BOUND-03

- Indexing boundaries as facets
- Graph node creation from boundaries
- Version range indexing strategy

### 10.4 Deferred to BOUND-04

- Retrieval-time boundary evaluation
- Filtering on required constraint mismatch
- Penalizing on excluded constraint match
- Boosting on preferred constraint match

---

## 11. References

### 11.1 Codebase Files

- `packages/contracts/src/domain/common.ts` - Base type patterns
- `packages/contracts/src/domain/decay.ts` - Phase 48 schema addition pattern
- `packages/contracts/src/domain/artifacts.ts` - SkillProfile with prerequisites
- `packages/contracts/src/domain/knowledge.ts` - KnowledgeEntry schema
- `packages/contracts/src/domain/plans.ts` - PlanTrapNode with evidence field
- `packages/server/src/lib/store.ts` - Record type definitions
- `packages/server/src/lib/governance/types.ts` - GovernedEntity interface

### 11.2 Planning Documents

- `.planning/REQUIREMENTS.md` - BOUND requirements definition
- `.planning/PROJECT.md` - Project context and decisions
- `.planning/phases/48-lifecycle-state-machine/48-RESEARCH.md` - Phase 48 research pattern
- `.planning/phases/48-lifecycle-state-machine/48-PATTERNS.md` - Phase 48 pattern map

### 11.3 External References

- [Semver specification](https://semver.org/) - For version range format
- [Zod documentation](https://zod.dev/) - Schema validation patterns

---

*Research completed: 2026-05-02*
