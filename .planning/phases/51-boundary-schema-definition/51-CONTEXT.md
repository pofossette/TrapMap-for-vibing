# Phase 51: Boundary Schema Definition - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto-generated with --auto flag

<domain>
## Phase Boundary

Define unified boundary schema with 6 layers shared across trap and skill artifacts.

**Requirements:** BOUND-01

**In scope:**
- Create BoundarySchema with 6 layers: context, versions, prerequisites, signals, exclusions, evidence
- Define structured fields with typed values (string arrays, version ranges, condition objects)
- Ensure schema is shared between trap (knowledge) and skill artifact types with no divergence
- Generate TypeScript types from Zod schemas with runtime validation

**Out of scope:**
- Boundary capture in submission flow (Phase 52)
- Boundary indexing and graph integration (Phase 53)
- Retrieval-time filtering based on boundaries (Phase 54)
- Automatic boundary inference from content (BOUND-06, v2)

</domain>

<decisions>
## Implementation Decisions

### Layer Structure Design
- **D-01:** Each layer is a dedicated Zod schema object combined into BoundarySchema
- **D-02:** Context layer: `{environments?: string[], platforms?: string[], runtimes?: string[]}`
- **D-03:** Versions layer: array of VersionConstraint objects with dependency name and range
- **D-04:** Prerequisites layer: array of prerequisite identifiers with optional condition objects
- **D-05:** Signals layer: `{keywords?: string[], errorPatterns?: string[], symptoms?: string[]}`
- **D-06:** Exclusions layer: array of Exclusion objects with identifier and optional reason
- **D-07:** Evidence layer: array of Evidence objects with source, type, confidence, timestamp

### Version Range Syntax
- **D-08:** Use semver-compliant range syntax compatible with existing npm/node ecosystem
- **D-09:** Support operators: exact, ^, ~, >, <, >=, <=, * (wildcard)
- **D-10:** VersionConstraint type: `{dependency: string, range: string, displayName?: string}`

### Condition Object Model
- **D-11:** Condition objects use `{field: string, operator: ConditionOperator, value: string}` structure
- **D-12:** ConditionOperator enum: 'equals', 'not-equals', 'contains', 'not-contains', 'matches', 'not-matches'
- **D-13:** Conditions can be nested in prerequisites and exclusions for complex applicability rules

### Schema Sharing Mechanism
- **D-14:** Create single `packages/contracts/src/domain/boundary.ts` module
- **D-15:** BoundarySchema is exported and imported by both knowledge.ts and artifacts.ts
- **D-16:** BoundaryMeta field added to KnowledgeEntry and SkillArtifact schemas (nullable for backward compatibility)
- **D-17:** Use shared common types (entityIdSchema, isoTimestampSchema) for consistency

### Evidence Structure
- **D-18:** EvidenceEntry type: `{source: string, type: EvidenceType, confidence: number, timestamp?: string, details?: string}`
- **D-19:** EvidenceType enum: 'user-reported', 'auto-detected', 'inferred', 'reviewed'
- **D-20:** Confidence is a number in range [0, 1] representing applicability certainty

### Claude's Discretion
- Exact field naming within each layer (camelCase vs kebab-case in serialized form)
- Default values for optional fields
- Maximum array lengths for validation
- Whether to include a `raw?` field for free-form boundary notes

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` §BOUND-01 — Boundary schema requirement definition

### Schema Patterns
- `packages/contracts/src/domain/decay.ts` — Pattern for extensible metadata schemas with enums and config objects
- `packages/contracts/src/domain/common.ts` — Shared primitive types (entityIdSchema, isoTimestampSchema, etc.)
- `packages/contracts/src/domain/knowledge.ts` — Target integration point for trap artifacts
- `packages/contracts/src/domain/artifacts.ts` — Target integration point for skill artifacts

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `decay.ts`: Pattern for enum + config + meta schema composition (DecayState, DecayConfig, DecayMeta)
- `common.ts`: Primitive types (entityIdSchema, isoTimestampSchema, labelSchema, scopeSchema, securityLevelSchema)
- Zod inference pattern: `export type X = z.infer<typeof xSchema>`

### Established Patterns
- Schemas live in `packages/contracts/src/domain/`
- Each domain file exports schemas and inferred types
- Index file re-exports from domain modules
- Runtime validation via Zod parse/safeParse
- Nullable fields for backward compatibility when adding new metadata

### Integration Points
- `KnowledgeEntry` schema in `knowledge.ts` — add `boundaryMeta?: BoundaryMeta`
- `SkillArtifact` schema in `artifacts.ts` — add `boundaryMeta?: BoundaryMeta`
- `packages/contracts/src/index.ts` — export new boundary types

</code_context>

<specifics>
## Specific Ideas

- Follow decay.ts as the template: enums first, then config schemas, then meta schema
- Keep each layer as a separate schema for composability and testing
- Consider future indexing needs when choosing field structures (flat arrays preferred over nested objects for easier querying)

</specifics>

<deferred>
## Deferred Ideas

- Automatic boundary inference from content (BOUND-06)
- Cross-team boundary sharing and standardization (BOUND-07)
- Boundary versioning and migration (future consideration)

</deferred>

---

*Phase: 51-boundary-schema-definition*
*Context gathered: 2026-05-02*
