---
wave: 1
depends_on: []
files_modified:
  - packages/contracts/src/domain/boundary.ts
  - packages/contracts/src/domain/boundary.test.ts
  - packages/contracts/src/index.ts
  - packages/server/src/lib/store.ts
  - packages/server/src/lib/governance/types.ts
autonomous: true
requirements: [BOUND-01]
---

# Phase 51: Boundary Schema Definition

**Goal:** Define unified boundary schema across trap and skill artifacts.

**Success Criteria:**
1. Schema defines 6 boundary layers: context, versions, prerequisites, signals, exclusions, evidence
2. Each layer contains structured fields with defined types (string arrays, version ranges, condition objects)
3. Schema shared across trap and skill artifact types with no divergence
4. TypeScript types generated from schema with runtime validation

---

## Task 1: Create Boundary Schema Definition

<read_first>
- packages/contracts/src/domain/decay.ts (pattern for schema file structure, Zod imports, JSDoc style)
- packages/contracts/src/domain/common.ts (base types: entityIdSchema, isoTimestampSchema)
</read_first>

<action>
Create `packages/contracts/src/domain/boundary.ts` with the following content:

1. **Imports** (lines 1-4):
```typescript
import { z } from 'zod';
```

2. **Enum Schemas** (lines 6-40):
```typescript
/**
 * Kind of condition for prerequisites.
 */
export const conditionKindSchema = z.enum([
  'environment',
  'permission',
  'tool',
  'configuration',
  'other',
]);

/**
 * Kind of signal pattern for relevance detection.
 */
export const signalKindSchema = z.enum([
  'exact',
  'keyword',
  'regex',
  'error-code',
  'log-pattern',
]);

/**
 * Kind of exclusion rule.
 */
export const exclusionKindSchema = z.enum([
  'platform',
  'version',
  'context',
  'configuration',
  'other',
]);

/**
 * Kind of evidence reference.
 */
export const evidenceKindSchema = z.enum([
  'issue',
  'incident',
  'cve',
  'documentation',
  'test',
  'commit',
  'other',
]);
```

3. **Sub-Schemas** (lines 42-130):
```typescript
/**
 * Version constraint for tools and libraries.
 *
 * Package names follow npm naming conventions.
 * Ranges use semver-compatible syntax (parsed at retrieval time).
 */
export const versionConstraintSchema = z.object({
  /** Package or tool name (e.g., 'react', 'node', 'typescript') */
  package: z.string().min(1).max(128),
  /** Version range in semver-compatible syntax (e.g., '>=16.8.0', '^18.0.0') */
  range: z.string().min(1).max(64),
  /** Optional note explaining why this constraint exists */
  note: z.string().max(280).optional(),
});

/**
 * Condition for prerequisites and requirements.
 *
 * Describes what must be true before applying knowledge.
 */
export const boundaryConditionSchema = z.object({
  /** Human-readable condition description */
  description: z.string().min(1).max(280),
  /** Optional structured type hint for categorization */
  kind: conditionKindSchema.optional(),
  /** Whether this condition is required (default) or optional */
  required: z.boolean().default(true),
});

/**
 * Signal matcher for relevance detection.
 *
 * Patterns that indicate this knowledge is applicable.
 */
export const signalMatcherSchema = z.object({
  /** Pattern to match (exact string, keyword, regex, error code, or log pattern) */
  pattern: z.string().min(1).max(500),
  /** Pattern type determining matching semantics */
  kind: signalKindSchema.default('keyword'),
  /** Optional description of when this signal fires */
  description: z.string().max(280).optional(),
});

/**
 * Exclusion rule for applicability negation.
 *
 * Conditions that make this knowledge NOT applicable.
 */
export const exclusionRuleSchema = z.object({
  /** Human-readable exclusion description */
  description: z.string().min(1).max(280),
  /** Category of exclusion for filtering */
  kind: exclusionKindSchema.optional(),
});

/**
 * Evidence reference supporting boundary assertions.
 *
 * Links to external sources that validate the boundary.
 */
export const evidenceReferenceSchema = z.object({
  /** Type of evidence source */
  kind: evidenceKindSchema,
  /** Reference identifier (issue number, CVE ID, commit hash, etc.) */
  identifier: z.string().min(1).max(128),
  /** Optional URL to the evidence source */
  url: z.string().url().max(512).optional(),
  /** Optional note about relevance to this boundary */
  note: z.string().max(280).optional(),
});
```

4. **Main Schema** (lines 132-165):
```typescript
/**
 * Unified boundary schema for knowledge applicability constraints.
 *
 * Six layers define when knowledge is applicable:
 * - context: Situational context labels (e.g., 'frontend', 'production')
 * - versions: Version constraints for tools and libraries
 * - prerequisites: Conditions that must be satisfied
 * - signals: Patterns indicating relevance
 * - exclusions: Conditions that make knowledge NOT applicable
 * - evidence: Supporting evidence for boundary assertions
 *
 * All layers default to empty arrays for backward compatibility.
 * Nullable on records to distinguish "no boundary" from "empty boundary".
 */
export const boundarySchema = z.object({
  /** Situational context labels where this knowledge applies */
  context: z.array(z.string().min(1).max(64)).max(10).default([]),
  /** Version constraints for tools and libraries */
  versions: z.array(versionConstraintSchema).max(10).default([]),
  /** Prerequisites that must be satisfied before applying */
  prerequisites: z.array(boundaryConditionSchema).max(10).default([]),
  /** Signals indicating this knowledge is relevant */
  signals: z.array(signalMatcherSchema).max(20).default([]),
  /** Exclusion conditions that make this knowledge NOT applicable */
  exclusions: z.array(exclusionRuleSchema).max(10).default([]),
  /** Supporting evidence for boundary assertions */
  evidence: z.array(evidenceReferenceSchema).max(10).default([]),
});
```

5. **Type Exports** (lines 167-180):
```typescript
export type ConditionKind = z.infer<typeof conditionKindSchema>;
export type SignalKind = z.infer<typeof signalKindSchema>;
export type ExclusionKind = z.infer<typeof exclusionKindSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type BoundaryCondition = z.infer<typeof boundaryConditionSchema>;
export type SignalMatcher = z.infer<typeof signalMatcherSchema>;
export type ExclusionRule = z.infer<typeof exclusionRuleSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type Boundary = z.infer<typeof boundarySchema>;
```

File should be approximately 180 lines total.
</action>

<acceptance_criteria>
- File `packages/contracts/src/domain/boundary.ts` exists
- File contains `import { z } from 'zod';` at line 1
- File defines `conditionKindSchema` z.enum with 5 values: environment, permission, tool, configuration, other
- File defines `signalKindSchema` z.enum with 5 values: exact, keyword, regex, error-code, log-pattern
- File defines `exclusionKindSchema` z.enum with 5 values: platform, version, context, configuration, other
- File defines `evidenceKindSchema` z.enum with 7 values: issue, incident, cve, documentation, test, commit, other
- File defines `versionConstraintSchema` with package (min 1, max 128), range (min 1, max 64), optional note (max 280)
- File defines `boundaryConditionSchema` with description (min 1, max 280), optional kind, required (default true)
- File defines `signalMatcherSchema` with pattern (min 1, max 500), kind (default 'keyword'), optional description
- File defines `exclusionRuleSchema` with description (min 1, max 280), optional kind
- File defines `evidenceReferenceSchema` with kind, identifier (min 1, max 128), optional url (max 512), optional note
- File defines `boundarySchema` with 6 layers: context, versions, prerequisites, signals, exclusions, evidence
- All 6 layers in boundarySchema have .default([])
- context layer has max 10 items, signals has max 20, others have max 10
- File exports 11 types: ConditionKind, SignalKind, ExclusionKind, EvidenceKind, VersionConstraint, BoundaryCondition, SignalMatcher, ExclusionRule, EvidenceReference, Boundary
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm typecheck` passes
</acceptance_criteria>

---

## Task 2: Create Boundary Schema Tests

<read_first>
- packages/contracts/src/domain/boundary.ts (schema to test)
- packages/contracts/src/domain/plans.test.ts (pattern for test file structure, vitest imports, describe/it pattern)
</read_first>

<action>
Create `packages/contracts/src/domain/boundary.test.ts` with the following test cases:

1. **Imports and Setup** (lines 1-15):
```typescript
import { describe, expect, it } from 'vitest';
import {
  boundaryConditionSchema,
  boundarySchema,
  conditionKindSchema,
  evidenceKindSchema,
  evidenceReferenceSchema,
  exclusionKindSchema,
  exclusionRuleSchema,
  signalKindSchema,
  signalMatcherSchema,
  versionConstraintSchema,
} from './boundary.js';
```

2. **Test Suites** for each schema:

**conditionKindSchema tests** (lines 17-35):
- Test "accepts valid condition kinds": parse each of the 5 enum values, expect return value matches input
- Test "rejects invalid condition kind": expect `conditionKindSchema.parse('invalid-kind')` to throw

**signalKindSchema tests** (lines 37-55):
- Test "accepts valid signal kinds": parse each of the 5 enum values
- Test "rejects invalid signal kind": expect parse of 'invalid' to throw

**exclusionKindSchema tests** (lines 57-75):
- Test "accepts valid exclusion kinds": parse each of the 5 enum values
- Test "rejects invalid exclusion kind": expect parse of 'invalid' to throw

**evidenceKindSchema tests** (lines 77-95):
- Test "accepts valid evidence kinds": parse each of the 7 enum values
- Test "rejects invalid evidence kind": expect parse of 'invalid' to throw

**versionConstraintSchema tests** (lines 97-130):
- Test "accepts valid semver range": parse `{ package: 'react', range: '>=16.8.0' }`, expect package='react', range='>=16.8.0'
- Test "accepts with optional note": parse `{ package: 'node', range: '>=18', note: 'Required for native fetch' }`
- Test "rejects empty package name": parse `{ package: '', range: '>=1.0.0' }` throws
- Test "rejects empty range": parse `{ package: 'react', range: '' }` throws
- Test "rejects package over 128 chars": parse with 129-char package name throws
- Test "rejects range over 64 chars": parse with 65-char range throws

**boundaryConditionSchema tests** (lines 132-160):
- Test "accepts required condition": parse `{ description: 'Admin access required' }`, expect required=true
- Test "accepts optional condition": parse `{ description: 'Docker installed', required: false }`, expect required=false
- Test "defaults required to true": parse `{ description: 'Test' }` has required=true
- Test "accepts with kind": parse `{ description: 'Test', kind: 'permission' }`
- Test "rejects empty description": parse `{ description: '' }` throws
- Test "rejects description over 280 chars": parse with 281-char description throws

**signalMatcherSchema tests** (lines 162-195):
- Test "accepts keyword pattern": parse `{ pattern: 'ECONNREFUSED' }`, expect kind='keyword'
- Test "defaults kind to keyword": parse `{ pattern: 'test' }` has kind='keyword'
- Test "accepts regex pattern": parse `{ pattern: '^Error:.*$', kind: 'regex' }`
- Test "accepts error-code pattern": parse `{ pattern: 'ENOENT', kind: 'error-code' }`
- Test "accepts with description": parse `{ pattern: 'test', description: 'When this fires' }`
- Test "rejects empty pattern": parse `{ pattern: '' }` throws
- Test "rejects pattern over 500 chars": parse with 501-char pattern throws

**exclusionRuleSchema tests** (lines 197-220):
- Test "accepts valid exclusion": parse `{ description: 'Not for Windows' }`
- Test "accepts with kind": parse `{ description: 'SSR only', kind: 'context' }`
- Test "rejects empty description": parse `{ description: '' }` throws

**evidenceReferenceSchema tests** (lines 222-255):
- Test "accepts valid evidence with URL": parse `{ kind: 'issue', identifier: '123', url: 'https://github.com/org/repo/issues/123' }`
- Test "accepts evidence without URL": parse `{ kind: 'incident', identifier: 'INC-2024-001' }`
- Test "accepts all evidence kinds": loop through all 7 kinds, parse `{ kind, identifier: 'test' }`
- Test "rejects empty identifier": parse `{ kind: 'issue', identifier: '' }` throws
- Test "rejects invalid URL": parse `{ kind: 'issue', identifier: '123', url: 'not-a-url' }` throws
- Test "rejects identifier over 128 chars": parse with 129-char identifier throws

**boundarySchema tests** (lines 257-330):
- Test "defaults all layers to empty arrays": `boundarySchema.parse({})` returns object with all 6 layers as empty arrays
- Test "accepts complete boundary with all layers":
```typescript
const boundary = boundarySchema.parse({
  context: ['frontend', 'production'],
  versions: [{ package: 'react', range: '>=16.8.0' }],
  prerequisites: [{ description: 'Admin access required' }],
  signals: [{ pattern: 'ECONNREFUSED', kind: 'error-code' }],
  exclusions: [{ description: 'Not for SSR' }],
  evidence: [{ kind: 'issue', identifier: '123' }],
});
expect(boundary.context).toHaveLength(2);
expect(boundary.versions).toHaveLength(1);
expect(boundary.prerequisites).toHaveLength(1);
expect(boundary.signals).toHaveLength(1);
expect(boundary.exclusions).toHaveLength(1);
expect(boundary.evidence).toHaveLength(1);
```
- Test "rejects context over 10 items": parse with 11 context strings throws
- Test "rejects signals over 20 items": parse with 21 signal patterns throws
- Test "rejects versions over 10 items": parse with 11 version constraints throws
- Test "rejects context item over 64 chars": parse with 65-char context string throws
- Test "validates nested schema": parse with invalid version constraint (empty package) throws

</action>

<acceptance_criteria>
- File `packages/contracts/src/domain/boundary.test.ts` exists
- File contains `import { describe, expect, it } from 'vitest';`
- File imports all 10 schemas from './boundary.js'
- File has describe block for 'conditionKindSchema' with at least 2 tests
- File has describe block for 'signalKindSchema' with at least 2 tests
- File has describe block for 'exclusionKindSchema' with at least 2 tests
- File has describe block for 'evidenceKindSchema' with at least 2 tests
- File has describe block for 'versionConstraintSchema' with at least 5 tests
- File has describe block for 'boundaryConditionSchema' with at least 5 tests
- File has describe block for 'signalMatcherSchema' with at least 6 tests
- File has describe block for 'exclusionRuleSchema' with at least 3 tests
- File has describe block for 'evidenceReferenceSchema' with at least 5 tests
- File has describe block for 'boundarySchema' with at least 7 tests
- Test "defaults all layers to empty arrays" exists in boundarySchema describe block
- Test "accepts complete boundary with all layers" exists in boundarySchema describe block
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm test packages/contracts/src/domain/boundary.test.ts` passes
</acceptance_criteria>

---

## Task 3: Add Barrel Export for Boundary Schema

<read_first>
- packages/contracts/src/index.ts (existing barrel export pattern)
- packages/contracts/src/domain/boundary.ts (schema to export)
</read_first>

<action>
Modify `packages/contracts/src/index.ts` to add the boundary schema export.

**Change:** Add the following line after `export * from './domain/artifacts.js';` (alphabetically before 'auth.js'):
```typescript
export * from './domain/boundary.js';
```

The modified section should look like:
```typescript
export * from './domain/artifacts.js';
export * from './domain/boundary.js';
export * from './domain/auth.js';
export * from './domain/candidates.js';
export * from './domain/common.js';
export * from './domain/decay.js';
// ... rest unchanged
```

This follows alphabetical ordering within the domain exports section.
</action>

<acceptance_criteria>
- File `packages/contracts/src/index.ts` contains `export * from './domain/boundary.js';`
- The export line appears after `export * from './domain/artifacts.js';`
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm typecheck` passes
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm build` passes
</acceptance_criteria>

---

## Task 4: Add Boundary to KnowledgeRecord and SkillArtifactRecord

<read_first>
- packages/server/src/lib/store.ts (existing record types, DecayMeta pattern for nullable field addition)
- packages/contracts/src/domain/boundary.ts (Boundary type to import)
- packages/contracts/src/index.ts (verify Boundary is exported)
</read_first>

<action>
Modify `packages/server/src/lib/store.ts` to add the `boundary` field to both record types.

**Change 1:** Add `Boundary` to the type imports at the top (line 5-14):
```typescript
import type {
  Boundary,  // NEW - add after CandidateSubmission
  CandidateSubmission,
  DecayMeta,
  DuplicateCase,
  LifecycleState,
  Permission,
  RoleTemplate,
  Scope,
  ScriptActivationPolicy,
} from '@trapmap/contracts';
```

**Change 2:** Add `boundary` field to `KnowledgeRecord` interface (after `decayMeta`, before `createdAt`):
```typescript
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
  createdAt: string;
```

**Change 3:** Add `boundary` field to `SkillArtifactRecord` interface (after `decayMeta`, before `createdAt`):
```typescript
  /** Decay state metadata for lifecycle management (null if not yet tracked) */
  decayMeta: DecayMeta | null;
  /** Boundary constraints for applicability (Phase 51) */
  boundary: Boundary | null;
  createdAt: string;
```

Both fields should be nullable (`| null`) for backward compatibility with existing records.
</action>

<acceptance_criteria>
- File `packages/server/src/lib/store.ts` contains `Boundary,` in the import from '@trapmap/contracts'
- File contains `boundary: Boundary | null;` within `KnowledgeRecord` interface
- File contains `boundary: Boundary | null;` within `SkillArtifactRecord` interface
- Both boundary fields have JSDoc comment `/** Boundary constraints for applicability (Phase 51) */`
- Both boundary fields appear after `decayMeta` field and before `createdAt` field
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm typecheck` passes
</acceptance_criteria>

---

## Task 5: Add Boundary to GovernedEntity Interface

<read_first>
- packages/server/src/lib/governance/types.ts (existing GovernedEntity interface, decayState pattern for optional field)
- packages/contracts/src/domain/boundary.ts (Boundary type to import)
- packages/contracts/src/index.ts (verify Boundary is exported)
</read_first>

<action>
Modify `packages/server/src/lib/governance/types.ts` to add the `boundary` field to `GovernedEntity`.

**Change 1:** Add `Boundary` to the type imports (line 6):
```typescript
import type { Boundary, DecayState, LifecycleState, Scope, SecurityLevel } from '@trapmap/contracts';
```

**Change 2:** Add `boundary` field to `GovernedEntity` interface (after `decayState`, at the end):
```typescript
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
  decayState?: DecayState;
  /** Boundary constraints for retrieval filtering (Phase 51) */
  boundary?: Boundary | null;
}
```

Use `?: ... | null` pattern to match `decayState` for optional nullable fields.
</action>

<acceptance_criteria>
- File `packages/server/src/lib/governance/types.ts` contains `Boundary` in the import from '@trapmap/contracts'
- File contains `boundary?: Boundary | null;` within `GovernedEntity` interface
- Field has JSDoc comment `/** Boundary constraints for retrieval filtering (Phase 51) */`
- Field appears after `decayState` field
- Command `cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing && pnpm typecheck` passes
</acceptance_criteria>

---

## Verification

After all tasks complete, run:

```bash
cd /home/wunai/gsd-workspaces/boundary-chain/TrapMap-for-vibing
pnpm typecheck
pnpm test packages/contracts/src/domain/boundary.test.ts
pnpm build
```

All commands must pass with zero errors.

---

## must_haves

Derived from phase goal "Define unified boundary schema across trap and skill artifacts":

1. **6-layer schema exists**: `boundarySchema` defines all 6 layers: context, versions, prerequisites, signals, exclusions, evidence
2. **TypeScript types exported**: File exports `Boundary`, `VersionConstraint`, `BoundaryCondition`, `SignalMatcher`, `ExclusionRule`, `EvidenceReference` types
3. **Runtime validation works**: Zod schemas parse valid input and reject invalid input (verified by tests)
4. **Shared across domains**: Both `KnowledgeRecord` and `SkillArtifactRecord` have `boundary: Boundary | null` field
5. **No divergence**: Single `Boundary` type used in both trap (KnowledgeRecord) and skill (SkillArtifactRecord) contexts
6. **Future-ready**: `GovernedEntity` has optional boundary field for Phase 54 retrieval filtering

---

*Plan created: 2026-05-02*
