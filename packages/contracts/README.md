
# @trapmap/contracts

Shared Zod schemas, TypeScript types, and port interfaces that form the runtime contract boundary between CLI, server, and async workers in the TrapMap platform.

## Installation

```bash
pnpm add @trapmap/contracts
```

## Entry Points

| Entry | Import Path | Description |
|-------|-------------|-------------|
| Main | `@trapmap/contracts` | All domain schemas, types, enum types, and utility functions |
| Evals | `@trapmap/contracts/evals` | Evaluation schemas for retrieval, summary, live eval, agent planning, and label alignment |

## Directory Structure

```
src/
  index.ts              # Main entry — re-exports everything from domain/ and enum-types/
  domain/               # Domain-organized Zod schemas, types, and port interfaces
    admin.ts            # Admin boundary search queries
    artifacts.ts        # Skill artifact schemas (files, scripts, profiles, capsules, manifests)
    artifact-ports.ts   # Artifact read projection port interface
    async.ts            # Async event contracts and shared job contracts
    auth.ts             # Login, session, auth context schemas
    boundary.ts         # Applicability constraints (context, versions, prerequisites, signals, exclusions)
    candidates.ts       # Candidate submission and duplicate detection schemas
    common.ts           # Shared primitives (entityId, sha256Hex, label, permission, lifecycleState, etc.)
    conflict.ts         # Conflict relation and hint schemas
    conflict-projection.ts # Conflict read projection and enrichment
    decay.ts            # Freshness decay states, configs, and batch operations
    evidence.ts         # Evidence metadata and provenance schemas
    feedback.ts         # User feedback, remediation, batch ops, lifecycle triggers
    graph-extraction.ts # LLM graph extraction schemas (nodes, edges, label alignment)
    graph-index.ts      # Graph index document records and repository port
    graph-query.ts      # Graph query backend interface and in-memory implementation
    health.ts           # Health status and dependency check schemas
    knowledge.ts        # Knowledge entry, revision, submission, lifecycle event schemas
    knowledge-owner-ports.ts # Knowledge command and operations port interfaces
    label-repository.ts # Canonical label catalog repository interface
    log-schema.ts       # Structured log entries with Loki label helpers
    maintenance.ts      # Ownership tracking, review-due SLAs, batch operations
    observability.ts    # Correlation context, event categories, metrics, failure taxonomy
    observability-config.ts # Feature flags and observability configuration
    operations.ts       # Import/export, audit, stats, async ops, skill edit/history/review, migration
    parsing.ts          # Markdown frontmatter parsing, media type detection
    path-validation.ts  # Secure relative path validation (canonicalPathSchema)
    plans.ts            # Trap-first execution plans with graph nodes/edges
    retrieval.ts        # v1/v2/v3 retrieval queries, routing traces, capsule matches, activation hints
    retrieval-fixtures.ts # Test fixture factories for retrieval testing
    retrieval-projection.ts # Read projection interfaces and cached model builders
    review.ts           # Review queue and decision schemas
    skills.ts           # Skill candidates and apply results
    task-queue.ts       # Task queue interfaces and worker controller
    team.ts             # Team, member, and access key schemas
    evals/              # Evaluation contract schemas
      index.ts          # Evals sub-entry point
      agent-planning.ts # Agent planning evaluation schemas
      label-alignment.ts # Label alignment evaluation schemas
      platform.ts       # Platform evaluation schemas
      report.ts         # Evaluation report schemas (summary, retrieval, baseline, regression)
      retrieval.ts      # Retrieval eval scenarios, cases, and expectations
      retrieval-live.ts # Live eval snapshots, service profiles, version comparison
      summary.ts        # Summary evaluation schemas
  enum-types/           # Shared enums and literal unions
    index.ts            # Aggregates all enum types
    badcase-taxonomy.ts # Badcase failure taxonomy (recall-miss, ranking-error, etc.)
    backend-target.ts   # Deployment profile and backend target resolution
    path-validation.ts  # PathValidationError enum
    task-queue.ts       # TaskStatus type
```

## Key Domain Modules

### Common Primitives (`common.ts`)

Reusable base schemas composed into all domain files:

| Schema | Description |
|--------|-------------|
| `entityIdSchema` | 1-128 character string identifier |
| `isoTimestampSchema` | ISO 8601 datetime with offset |
| `sha256HexSchema` | 64-character lowercase hex string |
| `mediaTypeSchema` | IANA media type with regex validation |
| `labelSchema` | 1-48 character label (letters, numbers, `:`, `_`, `/`, `-`) |
| `lifecycleStateSchema` | `draft`, `submitted`, `agent-pass`, `agent-rejected`, `approved`, `rejected`, `deactivated` |
| `permissionSchema` | 15 granular permissions (`session:read`, `knowledge:submit`, etc.) |
| `securityLevelSchema` | Integer 0-10 |
| `actorRefSchema` | Actor reference with id, handle, securityLevel |
| `auditMetadataSchema` | createdAt + updatedAt timestamps |
| `paginatedQuerySchema` / `paginatedResponseSchema` | Cursor-based pagination |

### Path Validation (`path-validation.ts`)

Security-hardened relative path validation used across all schemas that accept file paths:

| Schema / Function | Description |
|-------------------|-------------|
| `canonicalPathSchema` | Zod schema rejecting absolute paths, parent traversal, and Windows drive letters |
| `validateRelativePath()` | Runtime validation function |

### Knowledge Entries (`knowledge.ts`)

Full lifecycle for knowledge (trap) entries including submissions, reviews, revisions, and lifecycle events:

| Schema | Description |
|--------|-------------|
| `knowledgeEntrySchema` | Complete knowledge entry with history, metadata, boundary, evidence, maintenance, remediation |
| `knowledgeSubmissionSchema` | New submission request |
| `knowledgeResubmissionSchema` | Resubmission after rejection |
| `knowledgeUpdateSchema` | Partial update request |
| `knowledgeMetadataSchema` | Submission/resubmission counts with invariant: `submissionCount >= resubmissionCount` |
| `agentReviewResultSchema` | Agent review with risk assessments |
| `reviewDecisionSchema` | Human reviewer approve/reject decision |
| `knowledgeLifecycleEventSchema` | Lifecycle state transition events |

### Skill Artifacts (`artifacts.ts`)

Skill-native artifact system with file manifests, script governance, and derived outputs:

| Schema | Description |
|--------|-------------|
| `skillArtifactSchema` | Aggregate root with governance, lifecycle, revision history |
| `skillArtifactRevisionSchema` | Immutable revision with file manifest and derived outputs |
| `skillArtifactFileSchema` | Individual file metadata (path, kind, hash, mediaType) |
| `skillProfileSchema` | Derived profile from SKILL.md and references |
| `skillCapsuleSchema` | Distilled knowledge capsule for retrieval |
| `clientManifestSchema` | Metadata-only activation manifest (no file bodies) |
| `scriptActivationPolicySchema` | `blocked`, `reference-only`, `needs-approval`, `client-executable` |

### Retrieval (`retrieval.ts`)

Multi-version retrieval contracts with routing traces and capsule-native responses:

| Schema | Description |
|--------|-------------|
| `retrievalQuerySchema` | v1 retrieval query with seed, filters, mode, boundary context |
| `retrievalResponseSchema` | v1 response with bucketed results (globalConstraints, projectKnowledge) |
| `retrievalV2QuerySchema` | v2 seed-only query (server parses intent internally) |
| `retrievalV2ResponseWithHintsSchema` | v2 capsule-first response with activation hints (metadata-only) |
| `graphPlanSearchQuerySchema` | v3 GraphRAG-lite query with fallback policy |
| `graphPlanSearchResponseSchema` | v3 response with trap-first plan or governed fallback |
| `routingTraceSchema` | Routing decision provenance for evaluation and debugging |
| `skillLookupQuerySchema` / `skillLookupResponseSchema` | Artifact-first skill search |

### Candidates (`candidates.ts`)

Async ingestion pipeline for new knowledge and skill submissions:

| Schema | Description |
|--------|-------------|
| `CandidateSubmissionSchema` | Full candidate record with status tracking, analysis snapshot, duplicate case |
| `DuplicateCaseSchema` | Duplicate detection results with sorted matches and severity classification |
| `candidateSubmissionRequestSchema` | Discriminated union: `trap` or `skill` source type |
| `ResolutionOutcomeSchema` | Outcome of manual review (published or merged) |
| `EntityLineageSchema` | Provenance tracking from candidate to published entity |

### Feedback (`feedback.ts`)

User-initiated feedback with automatic lifecycle state transitions:

| Schema | Description |
|--------|-------------|
| `feedbackSubmissionSchema` | Feedback request with problem type, description, optional badcase snapshot |
| `feedbackRecordSchema` | Full feedback record with status tracking |
| `feedbackRemediationStateSchema` | Suppression and remediation tracking |
| `feedbackBatchRequestSchema` | Batch resolve/dismiss/triage/transition operations |
| `lifecycleTriggerRuleSchema` | Automatic state transitions from feedback patterns |

Default trigger rules: 3x `outdated` in 30 days -> `stale`; 5x `incorrect` in 30 days -> `review-due`.

### Decay (`decay.ts`)

Freshness-based ranking with configurable decay curves:

| Schema | Description |
|--------|-------------|
| `decayConfigSchema` | Thresholds: reviewDueDays, staleDays, expireDays |
| `freshnessTypeSchema` | `evergreen`, `versioned`, `volatile` |
| `freshnessDecayConfigSchema` | Per-type decay curves (exponential, linear, step) |
| `batchOperationRequestSchema` | Batch extend/mark-review/deactivate/supersede |

### Operations (`operations.ts`)

Administrative operations including import/export, audit, stats, and async status:

| Schema | Description |
|--------|-------------|
| `importRequestSchema` / `importResponseSchema` | Knowledge entry import |
| `artifactImportRequestSchema` / `artifactExportRequestSchema` | Artifact bundle import/export |
| `auditEventSchema` / `auditQuerySchema` | Audit log events and queries |
| `statsUsageQuerySchema` / `statsSummaryQuerySchema` | Usage analytics |
| `asyncOperationsStatusResponseSchema` | Full async runtime status (queue, outbox, workflows, cache, diagnostics) |
| `skillEditRequestSchema` / `skillHistoryResponseSchema` | Skill editing and history |
| `legacyMigrationRequestSchema` | Legacy knowledge-to-artifact migration |
| `activationRequestSchema` / `activationResponseSchema` | Selective file activation |

### Observability (`observability.ts`, `observability-config.ts`, `log-schema.ts`)

Distributed tracing, metrics, and structured logging:

| Schema / Function | Description |
|-------------------|-------------|
| `correlationContextSchema` | W3C traceparent-based correlation with service and surface owner |
| `observabilityContractSchema` | Full observability contract (correlation keys, event categories, metric namespaces, failure taxonomy) |
| `logEntrySchema` | Structured log entry with Loki-safe label extraction |
| `redactLogContext()` | Automatic sensitive field redaction |
| `featureFlagsSchema` | Metrics, tracing, logging, service discovery toggles |

### Async Events (`async.ts`)

Typed event contracts with idempotency keys, retry policies, and downstream consumers:

| Schema | Description |
|--------|-------------|
| `asyncEventContracts` | 8 event types: KnowledgeApproved/Rejected/Superseded, TrapActivated/Deactivated, ArtifactIndexed, FeedbackRemediationTriggered, ReadModelRefreshRequested |
| `sharedJobContracts` | 6 job types: candidate_processing, knowledge/skill.index-follow-up, feedback.remediation-reactivation, feedback.badcase-export-draft, governance.conflict-detection |

### GraphRAG-lite (`plans.ts`, `graph-extraction.ts`, `graph-index.ts`, `graph-query.ts`)

Graph-based knowledge retrieval with trap-first execution plans:

| Schema | Description |
|--------|-------------|
| `trapFirstPlanSchema` | Execution plan with blocking traps, recommended skills, typed edges, topological sort |
| `graphPlanSchema` | Unified graph view with nodes, edges, citations, focus |
| `llmGraphExtractionSchema` | LLM-extracted graph nodes and edges |
| `GraphQueryBackend` | Interface for graph query backends (memory, neo4j) |
| `GraphIndexRepositoryPort` | Graph index persistence interface |

### Boundary (`boundary.ts`)

Six-layer applicability constraints for knowledge entries:

| Layer | Description |
|-------|-------------|
| `context` | Situational labels (e.g., `frontend`, `production`) |
| `versions` | Semver package constraints |
| `prerequisites` | Required conditions (environment, permission, tool) |
| `signals` | Relevance patterns (exact, keyword, regex, error-code) |
| `exclusions` | Inapplicability conditions |
| `evidence` | Supporting references (issues, CVEs, commits) |

### Evals Sub-Entry (`@trapmap/contracts/evals`)

Evaluation contracts for retrieval quality, summary groundedness, and live eval:

| Module | Description |
|--------|-------------|
| `retrieval.ts` | Retrieval eval scenarios, cases, tier/endpoint enums, relevance/governance/shape expectations |
| `report.ts` | Evaluation reports with slice summaries, cohort analysis, baseline comparison, regression detection |
| `retrieval-live.ts` | Live eval snapshots with service profiles, derivation context, version comparison |
| `summary.ts` | Summary evaluation with groundedness and coverage scoring |
| `agent-planning.ts` | Agent planning evaluation schemas |
| `label-alignment.ts` | Label alignment evaluation schemas |

## Shared Validation Helpers

Reusable helpers imported by all domain schemas:

| Helper | File | Purpose |
|--------|------|---------|
| `canonicalPathSchema` | `path-validation.ts` | Relative path security (rejects absolute, traversal, Windows drive letters) |
| `sha256HexSchema` | `common.ts` | 64-char lowercase hex string |
| `mediaTypeSchema` | `common.ts` | IANA media type with regex |

## Cross-Field Invariant Constraints

These `.refine()` / `.superRefine()` constraints enforce relationships that single-field validation cannot cover:

| Schema | File | Invariant |
|--------|------|-----------|
| `knowledgeMetadataSchema` | `knowledge.ts` | `submissionCount >= resubmissionCount` |
| `skillArtifactMetadataSchema` | `artifacts.ts` | `submissionCount >= resubmissionCount` |
| `conflictRelationSchema` | `conflict.ts` | `entryIdA !== entryIdB` and `entryIdA < entryIdB` |
| `retrievalV2ResponseWithHintsSchema` | `retrieval.ts` | Capsule content must not be raw source code |
| `sessionStatusResponseSchema` | `auth.ts` | `authenticated === true` implies `session !== null` |
| `batchOperationItemSchema` | `decay.ts` | `eligible` implies `ineligibilityReason === null` |
| `batchOperationResponseSchema` | `decay.ts` | `dryRun === true` implies `appliedAt === null` |
| `retrievalEvalRelevanceExpectationsSchema` | `evals/retrieval.ts` | `idealOrder` entries must be subset of `relevantIds` |
| `retrievalEvalGovernanceExpectationsSchema` | `evals/retrieval.ts` | `forbiddenIds.length === forbiddenReasons.length` |
| `retrievalEvalReportSchema` | `evals/report.ts` | `passRate === passedCases / totalCases` |
| `correlationContextSchema` | `observability.ts` | `traceId` must match traceparent |

## Port Interfaces

The package exports several port interfaces for dependency inversion:

| Interface | File | Purpose |
|-----------|------|---------|
| `KnowledgeOwnerPort` | `knowledge-owner-ports.ts` | Knowledge command + operations projection |
| `ArtifactReadProjection` | `artifact-ports.ts` | Artifact read-side queries |
| `GraphQueryBackend` | `graph-query.ts` | Graph query backend (memory/neo4j) |
| `GraphIndexRepositoryPort` | `graph-index.ts` | Graph index persistence |
| `LabelRepository` | `label-repository.ts` | Canonical label catalog |
| `CandidateCorpusReadPort` | `candidates.ts` | Approved corpus for duplicate detection |
| `TaskWorkerQueue` | `task-queue.ts` | Task queue dequeue/complete/fail |
| `ConflictReadProjection` | `conflict-projection.ts` | Conflict relation queries |

## Utility Functions

| Function | File | Description |
|----------|------|-------------|
| `validateRelativePath()` | `path-validation.ts` | Runtime path security validation |
| `createTaskWorkerController()` | `task-queue.ts` | Polling task worker with concurrency control |
| `buildGraphFromDocuments()` | `graph-query.ts` | Build graphology graph from index documents |
| `buildGraphRuntimeSnapshot()` | `graph-query.ts` | Build runtime snapshot with label/source indexes |
| `expandSourcesOneHop()` | `graph-query.ts` | One-hop graph expansion from query labels |
| `enrichConflictHints()` | `conflict-projection.ts` | Attach conflict hints to retrieval matches |
| `buildRetrievalReadProjection()` | `retrieval-projection.ts` | Build read projection from sources |
| `buildCachedRetrievalReadModel()` | `retrieval-projection.ts` | Cached variant of read projection |
| `parseSkillMarkdown()` | `parsing.ts` | Parse SKILL.md frontmatter and body |
| `detectMediaType()` | `parsing.ts` | File extension to media type mapping |
| `redactLogContext()` | `log-schema.ts` | Redact sensitive fields from log entries |
| `buildLokiLabels()` | `log-schema.ts` | Extract low-cardinality Loki labels |
| `extractTraceIdFromTraceparent()` | `observability.ts` | Parse W3C traceparent header |
| `normalizeBackendTarget()` | `enum-types/backend-target.ts` | Normalize deployment profile to backend target |
| `normalizeBadcaseTaxonomy()` | `enum-types/badcase-taxonomy.ts` | Normalize legacy failure classification aliases |
| `buildBadcaseEvalDraft()` | `operations.ts` | Construct badcase eval draft from feedback trace |
| `isRemediationSuppressed()` | `feedback.ts` | Check if entry is suppressed from retrieval |
| `createRetrievalKnowledgeFixture()` | `retrieval-fixtures.ts` | Test fixture factory |
| `createRetrievalArtifactFixture()` | `retrieval-fixtures.ts` | Test fixture factory |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `zod` | ^4.1.12 | Runtime schema validation |
| `graphology` | ^0.26.0 | Graph data structure for GraphRAG-lite |
| `graphology-dag` | ^0.4.1 | DAG cycle detection |
| `graphology-operators` | ^1.6.1 | Graph subgraph extraction |
| `graphology-shortest-path` | ^2.1.0 | Shortest path for graph expansion |
| `gray-matter` | ^4.0.3 | Markdown frontmatter parsing |
| `mime-types` | ^3.0.2 | Media type detection |

## Scripts

```bash
pnpm build        # Compile TypeScript
pnpm test         # Run unit tests (vitest)
pnpm typecheck    # Type-check without emitting
```

## Usage Examples

### Validating a retrieval query

```typescript
import { retrievalQuerySchema } from '@trapmap/contracts';

const result = retrievalQuerySchema.safeParse({
  seed: 'docker container timeout',
  filters: { labels: ['docker'], scopes: ['global'] },
  maxResults: 10,
});

if (result.success) {
  // result.data is typed as RetrievalQuery
  console.log(result.data.mode); // 'semantic' (default)
}
```

### Working with knowledge entries

```typescript
import { knowledgeSubmissionSchema, type KnowledgeEntry } from '@trapmap/contracts';

const submission = knowledgeSubmissionSchema.parse({
  scope: 'global',
  labels: ['docker', 'timeout'],
  shortcut: 'Docker container health check timeout',
  detail: 'When running health checks...',
});
```

### Using the evals sub-entry

```typescript
import { retrievalEvalCaseSchema, retrievalEvalReportSchema } from '@trapmap/contracts/evals';

const report = retrievalEvalReportSchema.parse({
  meta: { /* ... */ },
  summary: { totalCases: 10, passedCases: 8, failedCases: 2, passRate: 0.8, passed: true },
  slices: [],
  cases: [],
  failures: [],
  warnings: [],
});
```

### Task worker setup

```typescript
import { createTaskWorkerController, type TaskHandler } from '@trapmap/contracts';

const handler: TaskHandler<{ candidateId: string }> = {
  type: 'candidate_processing',
  handle: async (task, signal) => {
    // Process candidate
  },
};

const worker = createTaskWorkerController({
  queue: myQueueImplementation,
  handlers: [handler],
  concurrency: 3,
  pollIntervalMs: 2000,
});

await worker.run();
```

## Contract Conventions

### Retrieval contracts
- Source paths use `canonicalPathSchema` -- relative only, no absolute paths or traversal
- Capsule-first responses (`retrievalV2ResponseWithHintsSchema`) contain distilled content only, no raw source code
- Activation hints are metadata-only -- no file bodies or script content (T-15-01)
- All hashes use `sha256HexSchema` (64-char lowercase hex)

### Artifact contracts
- `skillArtifactRevisionSchema`: `derived.sourceHash` must match `sourceHash` when present
- `skillArtifactMetadataSchema`: `submissionCount >= resubmissionCount`
- File paths use `canonicalPathSchema` for relative path safety

### Eval contracts
- `retrievalEvalGovernanceExpectationsSchema`: `forbiddenIds.length === forbiddenReasons.length`
- `retrievalEvalRelevanceExpectationsSchema`: `idealOrder` entries must be subset of `relevantIds`
- Report schemas: `passRate === passedCases / totalCases` when `totalCases > 0`
- All timestamps use `z.string().datetime({ offset: true })`

### Observability contracts
- W3C traceparent format for distributed tracing
- Public additive fields: `requestId`, `queryId`, `feedbackId`, `asyncJobId`
- Internal-only fields: `operationId`, `causationId`, `workflowRunId`, `candidateId`, `entryId`, `artifactId`

## Internal Navigation

- Domain schemas: [`src/domain/`](src/domain/)
- Main entry: [`src/index.ts`](src/index.ts)
- Enum types: [`src/enum-types/`](src/enum-types/)
- Evals entry: [`src/domain/evals/index.ts`](src/domain/evals/index.ts)
