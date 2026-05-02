# Phase 51: Boundary Schema Definition - Research

**Gathered:** 2026-05-02
**Research Agent Output:** For planner reference

---

## Executive Summary

This research provides everything needed to plan Phase 51: Boundary Schema Definition. The phase builds directly on established patterns from the Decay feature (Phases 48-50) and integrates with both the Knowledge and Skill Artifact domains.

---

## 1. Existing Patterns to Follow

### 1.1 Domain Schema File Structure (from `decay.ts`)

**File:** `packages/contracts/src/domain/decay.ts`

The `decay.ts` file provides the canonical template for this phase:

```typescript
// Pattern: Enum → Config Schema → Meta Schema → Type Exports

// 1. Enums first
export const freshnessTypeSchema = z.enum(['evergreen', 'versioned', 'volatile']);
export type FreshnessType = z.infer<typeof freshnessTypeSchema>;

// 2. Config schemas for each variant
export const evergreenDecayConfigSchema = z.object({
  enabled: z.literal(false),
});

// 3. Composite config combining variants
export const freshnessDecayConfigSchema = z.object({
  evergreen: evergreenDecayConfigSchema.default({ enabled: false }),
  versioned: versionedDecayConfigSchema.default({...}),
  volatile: volatileDecayConfigSchema.default({...}),
});

// 4. Meta schema using shared primitives
export const decayMetaSchema = z.object({
  lastVerifiedAt: isoTimestampSchema,
  decayState: decayStateSchema,
  supersededById: entityIdSchema.nullable().default(null),
  decayStateComputedAt: isoTimestampSchema,
  freshnessType: freshnessTypeSchema.default('evergreen'),
});
```

**Apply to Phase 51:** Follow same order:
1. Define enums (ConditionOperator, EvidenceType)
2. Define layer schemas (ContextLayer, VersionsLayer, etc.)
3. Define composite BoundarySchema
4. Define BoundaryMeta for attachment to entries

### 1.2 Shared Primitives (from `common.ts`)

**File:** `packages/contracts/src/domain/common.ts`

Reusable primitives:
- `entityIdSchema` — for IDs and references
- `isoTimestampSchema` — for timestamps
- `labelSchema` — for keyword arrays
- `scopeSchema` — for governance scope
- `securityLevelSchema` — for access control

**Apply to Phase 51:**
- Use `entityIdSchema` for prerequisite IDs
- Use `isoTimestampSchema` for evidence timestamps
- Use `labelSchema` for keywords in signals layer

### 1.3 Integration Points

**KnowledgeEntry schema** (`knowledge.ts:94-115`):
```typescript
export const knowledgeEntrySchema = z
  .object({
    id: entityIdSchema,
    // ... existing fields ...
    // ADD: boundaryMeta: boundaryMetaSchema.nullable().optional(),
  })
  .merge(auditMetadataSchema);
```

**SkillArtifact schema** (`artifacts.ts:332-367`):
```typescript
export const skillArtifactSchema = z
  .object({
    id: entityIdSchema,
    // ... existing fields ...
    // ADD: boundaryMeta: boundaryMetaSchema.nullable().optional(),
  })
  .merge(auditMetadataSchema);
```

**Index export** (`index.ts`):
```typescript
// ADD: export * from './domain/boundary.js';
```

---

## 2. Technical Decisions Affecting Schema Design

### 2.1 Layer Structure (from CONTEXT.md D-01 to D-07)

| Layer | Structure | Rationale |
|-------|-----------|-----------|
| Context | `{environments?: string[], platforms?: string[], runtimes?: string[]}` | Optional string arrays for environment matching |
| Versions | `VersionConstraint[]` | Array allows multiple dependency constraints |
| Prerequisites | `Prerequisite[]` with optional conditions | Supports conditional prerequisites |
| Signals | `{keywords?: string[], errorPatterns?: string[], symptoms?: string[]}` | Three distinct signal types for retrieval |
| Exclusions | `Exclusion[]` with identifier + reason | Explicit exclusions with auditability |
| Evidence | `EvidenceEntry[]` | Provenance tracking with confidence scores |

### 2.2 Version Range Design (D-08 to D-10)

```typescript
// Proposed structure
export const versionConstraintSchema = z.object({
  dependency: z.string().min(1).max(128),     // e.g., "react", "node"
  range: z.string().min(1).max(64),           // e.g., "^18.0.0", ">=16 <19"
  displayName: z.string().max(128).optional(), // Human-readable: "React 18+"
});

// Validation note: Semver validation can be added via z.refine()
// but may be deferred to runtime validation layer
```

**Operators to support (D-09):**
- Exact: `1.2.3`
- Caret: `^1.2.3`
- Tilde: `~1.2.3`
- Comparison: `>1.0.0`, `<2.0.0`, `>=1.0.0`, `<=2.0.0`
- Wildcard: `*`, `1.x`, `1.2.x`

### 2.3 Condition Object Model (D-11 to D-13)

```typescript
export const conditionOperatorSchema = z.enum([
  'equals',
  'not-equals',
  'contains',
  'not-contains',
  'matches',      // regex match
  'not-matches',  // regex not match
]);

export const conditionSchema = z.object({
  field: z.string().min(1).max(128),
  operator: conditionOperatorSchema,
  value: z.string().min(1).max(512),
});
```

**Use cases:**
- Prerequisites with conditions: "Requires Docker Desktop running"
- Exclusions with conditions: "Not applicable when in WSL mode"

### 2.4 Evidence Structure (D-18 to D-20)

```typescript
export const evidenceTypeSchema = z.enum([
  'user-reported',
  'auto-detected',
  'inferred',
  'reviewed',
]);

export const evidenceEntrySchema = z.object({
  source: z.string().min(1).max(256),      // Who/what provided this evidence
  type: evidenceTypeSchema,
  confidence: z.number().min(0).max(1),    // [0, 1] probability scale
  timestamp: isoTimestampSchema.optional(),
  details: z.string().max(1000).optional(),
});
```

---

## 3. Integration with Existing Code

### 3.1 Backward Compatibility

**Principle:** Nullable/optional `boundaryMeta` field

Both `KnowledgeEntry` and `SkillArtifact` schemas should add:
```typescript
boundaryMeta: boundaryMetaSchema.nullable().optional(),
```

This ensures:
- Existing entries work without migration
- Gradual adoption of boundary features
- No breaking changes to API responses

### 3.2 Future Integration: Phase 53 (Indexing)

From Phase 53 CONTEXT.md:
- Boundary projections will be materialized for indexing
- Graph nodes will be created for standardized values (environments, versions)
- The schema should use flat arrays (not nested objects) for easier querying

**Design implication:** Keep layer fields as arrays of primitives or simple objects:
```typescript
// GOOD: Flat arrays
environments: z.array(z.string()).optional(),

// AVOID: Deeply nested structures
environments: z.object({
  production: z.object({ ... }),
  staging: z.object({ ... }),
}).optional(),
```

### 3.3 Future Integration: Phase 54 (Retrieval)

From Phase 54 requirements (BOUND-04):
- Required constraint mismatch → exclude from results
- Excluded constraint match → penalize in ranking
- Preferred constraint match → boost in ranking

**Design implication:** The schema must support distinguishing required vs. preferred constraints. Consider adding a `mode` field to constraint objects:

```typescript
export const prerequisiteSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().max(256).optional(),
  mode: z.enum(['required', 'preferred']).default('required'),
  condition: conditionSchema.optional(),
});
```

---

## 4. Validation Architecture

### 4.1 Zod Schema Validation

**Pattern from existing code:**
```typescript
// Runtime validation via safeParse
const result = boundaryMetaSchema.safeParse(input);
if (!result.success) {
  // Handle validation errors
}
```

**Type inference:**
```typescript
export type BoundaryMeta = z.infer<typeof boundaryMetaSchema>;
export type ContextLayer = z.infer<typeof contextLayerSchema>;
// ... etc for each layer
```

### 4.2 Validation Constraints

**Maximum array lengths (Claude's discretion, suggest defaults):**
- `environments`: max 10 items
- `platforms`: max 10 items
- `runtimes`: max 10 items
- `versions`: max 20 items
- `prerequisites`: max 20 items
- `keywords`: max 20 items
- `errorPatterns`: max 20 items
- `symptoms`: max 20 items
- `exclusions`: max 20 items
- `evidence`: max 10 items

**String length constraints:**
- Use existing `labelSchema` for keywords (max 48 chars)
- New string fields should have explicit max lengths

### 4.3 Semver Range Validation (Optional Enhancement)

For strict version range validation:
```typescript
import semver from 'semver';

const versionRangeSchema = z.string().refine(
  (val) => semver.validRange(val) !== null,
  { message: 'Invalid semver range' }
);
```

**Recommendation:** Keep validation simple in Phase 51, add strict semver validation later if needed.

---

## 5. Proposed Schema Module Structure

**File:** `packages/contracts/src/domain/boundary.ts`

```typescript
import { z } from 'zod';
import { entityIdSchema, isoTimestampSchema, labelSchema } from './common.js';

// =============================================================================
// Enums
// =============================================================================

export const conditionOperatorSchema = z.enum([
  'equals', 'not-equals', 'contains', 'not-contains', 'matches', 'not-matches',
]);

export const evidenceTypeSchema = z.enum([
  'user-reported', 'auto-detected', 'inferred', 'reviewed',
]);

export const constraintModeSchema = z.enum(['required', 'preferred', 'excluded']);

// =============================================================================
// Layer Schemas
// =============================================================================

export const contextLayerSchema = z.object({
  environments: z.array(z.string().max(64)).max(10).optional(),
  platforms: z.array(z.string().max(64)).max(10).optional(),
  runtimes: z.array(z.string().max(64)).max(10).optional(),
});

export const versionConstraintSchema = z.object({
  dependency: z.string().min(1).max(128),
  range: z.string().min(1).max(64),
  displayName: z.string().max(128).optional(),
  mode: constraintModeSchema.default('required'),
});

export const versionsLayerSchema = z.object({
  constraints: z.array(versionConstraintSchema).max(20).optional(),
});

export const conditionSchema = z.object({
  field: z.string().min(1).max(128),
  operator: conditionOperatorSchema,
  value: z.string().min(1).max(512),
});

export const prerequisiteSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().max(256).optional(),
  mode: constraintModeSchema.default('required'),
  condition: conditionSchema.optional(),
});

export const prerequisitesLayerSchema = z.object({
  items: z.array(prerequisiteSchema).max(20).optional(),
});

export const signalsLayerSchema = z.object({
  keywords: z.array(labelSchema).max(20).optional(),
  errorPatterns: z.array(z.string().max(256)).max(20).optional(),
  symptoms: z.array(z.string().max(256)).max(20).optional(),
});

export const exclusionSchema = z.object({
  id: z.string().min(1).max(128),
  reason: z.string().max(256).optional(),
  condition: conditionSchema.optional(),
});

export const exclusionsLayerSchema = z.object({
  items: z.array(exclusionSchema).max(20).optional(),
});

export const evidenceEntrySchema = z.object({
  source: z.string().min(1).max(256),
  type: evidenceTypeSchema,
  confidence: z.number().min(0).max(1),
  timestamp: isoTimestampSchema.optional(),
  details: z.string().max(1000).optional(),
});

export const evidenceLayerSchema = z.object({
  entries: z.array(evidenceEntrySchema).max(10).optional(),
});

// =============================================================================
// Composite Boundary Schema
// =============================================================================

export const boundarySchema = z.object({
  context: contextLayerSchema.optional(),
  versions: versionsLayerSchema.optional(),
  prerequisites: prerequisitesLayerSchema.optional(),
  signals: signalsLayerSchema.optional(),
  exclusions: exclusionsLayerSchema.optional(),
  evidence: evidenceLayerSchema.optional(),
});

// =============================================================================
// BoundaryMeta for attachment to entries/artifacts
// =============================================================================

export const boundaryMetaSchema = z.object({
  boundary: boundarySchema,
  lastUpdated: isoTimestampSchema,
  updatedBy: entityIdSchema.optional(),
  // Optional raw notes field (Claude's discretion)
  notes: z.string().max(1000).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type ConstraintMode = z.infer<typeof constraintModeSchema>;
export type ContextLayer = z.infer<typeof contextLayerSchema>;
export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type VersionsLayer = z.infer<typeof versionsLayerSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Prerequisite = z.infer<typeof prerequisiteSchema>;
export type PrerequisitesLayer = z.infer<typeof prerequisitesLayerSchema>;
export type SignalsLayer = z.infer<typeof signalsLayerSchema>;
export type Exclusion = z.infer<typeof exclusionSchema>;
export type ExclusionsLayer = z.infer<typeof exclusionsLayerSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type EvidenceLayer = z.infer<typeof evidenceLayerSchema>;
export type Boundary = z.infer<typeof boundarySchema>;
export type BoundaryMeta = z.infer<typeof boundaryMetaSchema>;
```

---

## 6. Gotchas and Constraints

### 6.1 Import Order

When adding `boundaryMeta` to `knowledge.ts` and `artifacts.ts`, ensure the import is added:
```typescript
import { boundaryMetaSchema } from './boundary.js';
```

The index.ts export order doesn't matter for type resolution, but logical grouping helps maintainability.

### 6.2 Nullable vs Optional

**Pattern to follow:**
```typescript
// For backward compatibility
boundaryMeta: boundaryMetaSchema.nullable().optional(),

// NOT just optional (undefined ≠ null in some contexts)
boundaryMeta: boundaryMetaSchema.optional(),  // Less explicit
```

### 6.3 Default Values

Each layer schema should have sensible defaults:
```typescript
// In the composite boundarySchema
context: contextLayerSchema.default({}),  // Empty object, not undefined
```

This allows partial updates without specifying all layers.

### 6.4 Condition Operator Complexity

The `matches` and `not-matches` operators imply regex. Consider:
- Documenting that `value` should be a valid regex pattern
- Potentially adding regex validation (or deferring to runtime)
- Security concern: ReDoS if user-provided regex is executed

**Recommendation:** Document regex usage, defer validation to Phase 52 (capture flow) where input sanitization happens.

### 6.5 Version Range Ambiguity

Semver ranges like `*` or empty string should be handled:
- `*` means "any version" — valid
- Empty string — invalid
- npm-style ranges like `18.x` — valid but may need normalization

**Recommendation:** Accept npm-compatible syntax, normalize in Phase 53 indexing.

---

## 7. Testing Considerations

### 7.1 Unit Tests

Test each layer schema independently:
```typescript
describe('contextLayerSchema', () => {
  it('accepts valid context', () => {
    const result = contextLayerSchema.safeParse({
      environments: ['production', 'staging'],
      platforms: ['linux', 'darwin'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects too many environments', () => {
    const result = contextLayerSchema.safeParse({
      environments: Array(11).fill('env'),
    });
    expect(result.success).toBe(false);
  });
});
```

### 7.2 Integration Tests

Test BoundaryMeta attachment to KnowledgeEntry and SkillArtifact:
```typescript
describe('KnowledgeEntry with boundaryMeta', () => {
  it('accepts entry with boundary metadata', () => {
    const entry = {
      // ... required fields ...
      boundaryMeta: {
        boundary: {
          context: { environments: ['production'] },
        },
        lastUpdated: '2026-05-02T00:00:00Z',
      },
    };
    expect(knowledgeEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('accepts entry without boundary metadata (backward compat)', () => {
    const entry = {
      // ... required fields without boundaryMeta ...
    };
    expect(knowledgeEntrySchema.safeParse(entry).success).toBe(true);
  });
});
```

---

## 8. Summary for Planner

**What's ready:**
- Clear pattern from `decay.ts` to follow
- All integration points identified
- Schema structure defined with all 6 layers
- Type constraints and validation approach specified

**What needs planning:**
- Exact file organization (single file vs. split by layer)
- Whether to add `notes` field for free-form boundary notes
- Test coverage strategy
- Documentation approach (JSDoc comments)

**Dependencies for execution:**
- No external dependencies needed (Zod already in use)
- No database migrations (additive, nullable field)
- No API changes required (internal schema only for Phase 51)

---

*Research completed: 2026-05-02*
