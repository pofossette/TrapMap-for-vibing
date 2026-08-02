# @trapmap/persistence-schema

Neutral Drizzle PostgreSQL schema layer. It holds only physical table definitions and stateless column factories -- no routes, repositories, or service behaviors.

Services and runtime consumers import table definitions from `@trapmap/persistence-schema`. When adding new tables or shared column factories, frozen migration invariants (table names, column names, defaults, indexes, constraints) must remain unchanged.

## Installation

```bash
pnpm add @trapmap/persistence-schema
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@trapmap/contracts` | Shared domain types (`Boundary`, `LifecycleState`, `Scope`, `CandidatePayload`, `AnalysisSnapshot`) |
| `drizzle-orm` | ORM table/column definitions and SQL helpers |

## Domain Modules

All modules are re-exported from the package entry point (`src/index.ts`).

### column-factories -- Shared Column Factories

Stateless factory functions that return reusable column groups. Used across all domain tables to enforce consistent schema patterns.

| Factory | Columns |
|---------|---------|
| `auditTimestamps()` | `createdAt`, `updatedAt` |
| `revisionColumns()` | `revisionNo`, `submittedAt`, `submittedByUserId`, `createdAt` |
| `lifecycleEventColumns()` | `id`, `type`, `createdAt`, `actorUserId`, `submissionId`, `revisionNo`, `state`, `note` |
| `boundaryVersionsColumns()` | `id`, `packageName`, `rangeValue`, `note`, `createdAt` |
| `boundaryPrerequisitesColumns()` | `id`, `description`, `kind`, `required`, `createdAt` |
| `boundarySignalsColumns()` | `id`, `pattern`, `kind`, `description`, `createdAt` |
| `boundaryExclusionsColumns()` | `id`, `description`, `kind`, `createdAt` |
| `boundaryEvidenceColumns()` | `id`, `kind`, `identifier`, `url`, `note`, `createdAt` |
| `artifactRevisionItemColumns()` | `id`, `artifactRevisionId`, `path` |
| `artifactFileDetailsColumns()` | `sha256`, `sizeBytes`, `mediaType`, `createdAt` |
| `artifactScriptDetailsColumns()` | `sha256`, `capability`, `argsSchemaSummary`, `sideEffectSummary`, `defaultPolicy`, `createdAt` |
| `capsuleIndexColumns()` | `capsuleId`, `artifactId`, `revisionNo`, `teamId`, `scope`, `requiredLevel`, `status` |
| `maintenanceAssignmentColumns()` | `maintainerUserId`, `maintainerHandle`, `maintainerLevel`, `reviewBy`, `createdAt`, `updatedAt` |
| `taskQueueColumns()` | `id`, `type`, `payload`, `status`, `priority`, `attempts`, `maxAttempts`, `lastError`, `dedupeKey`, `processAfter`, `workerId`, `startedAt`, `heartbeatAt`, `leaseUntil`, `createdAt`, `updatedAt`, `completedAt` |

### auth -- Identity and Access

Users, teams, memberships, sessions, access keys, and audit events.

| Table | Description |
|-------|-------------|
| `usersTable` | User accounts with handle |
| `teamsTable` | Team organizations with slug |
| `membershipsTable` | User-team relationships with role template and security level |
| `sessionsTable` | Active sessions with token hash and expiry |
| `accessKeysTable` | API access keys scoped to team membership |
| `auditEventsTable` | Immutable audit trail with request/trace/operation/causation IDs |

Sequences: `userIdSeq`, `teamIdSeq`, `membershipIdSeq`, `sessionIdSeq`, `accessKeyIdSeq`, `auditEventIdSeq`

### candidates -- Candidate Pipeline

Async ingestion pipeline for candidate submissions (traps and skills).

| Table | Description |
|-------|-------------|
| `candidates` | Candidate submissions with status lifecycle (`received` -> `queued` -> `analyzing` -> `resolved`/`error`) |
| `candidateAnalyses` | Normalized analysis results (fingerprint, keywords, tokens) |
| `candidateDuplicateCases` | Duplicate detection runs with severity classification |
| `candidateDuplicateMatches` | Individual match details within a duplicate case |
| `candidateManualResults` | Human review decisions (`independent` or `merged`) |
| `candidateResolutionOutcomes` | Applied resolution outcomes with published/merged entity references |
| `entityLineage` | Provenance tracking linking candidates to final entities |

### knowledge -- Knowledge Entries

Knowledge entry lifecycle, revisions, retrieval indexes, feedback, and analytics.

| Table | Description |
|-------|-------------|
| `knowledgeEntries` | Knowledge entries with lifecycle state, boundary constraints, DiveLog fields |
| `knowledgeRevisions` | Immutable revision history with review notes |
| `knowledgeSubmissions` | Submission aggregates capturing state at each submission |
| `knowledgeReviewDecisions` | Reviewer approve/reject decisions |
| `lifecycleEvents` | Audit trail of entry state transitions |
| `knowledgeLabels` | Structured (entry, label) pairs for queryable filtering |
| `knowledgeBoundaryContexts` | Situational context labels (e.g., 'frontend', 'production') |
| `knowledgeBoundaryVersions` | Semver version constraints for tools/libraries |
| `knowledgeBoundaryPrerequisites` | Pre-conditions for knowledge applicability |
| `knowledgeBoundarySignals` | Patterns indicating knowledge relevance |
| `knowledgeBoundaryExclusions` | Conditions making knowledge inapplicable |
| `knowledgeBoundaryEvidence` | External source links validating boundaries |
| `knowledgeMaintenanceAssignments` | Ownership and review-due tracking |
| `knowledgeEmbeddings` | pgvector 384-dim embeddings for semantic search (HNSW index) |
| `knowledgeKeywords` | Tokenized content for GIN-indexed lexical search |
| `knowledgeSearchDocuments` | tsvector documents for full-text search |
| `feedbackRecords` | User feedback with problem classification and remediation tracking |
| `feedbackCustomAnswers` | Structured Q&A answers attached to feedback |
| `usageEvents` | Retrieval hit events for time-series analytics |
| `usageEventsDailyRollup` | Pre-aggregated daily counts for fast analytics queries |
| `domainEventOutbox` | Durable outbox for domain events with lease-based processing |

Sequences: `knowledgeEntryIdSeq`

### artifacts -- Skill Artifacts

Skill artifact lifecycle, revisions, derived outputs, and search indexes.

| Table | Description |
|-------|-------------|
| `skillArtifacts` | Skill artifacts with scope, labels, lifecycle state, agent review, boundary constraints |
| `artifactRevisions` | Immutable revision history with files, script descriptors, and cached derived outputs |
| `skillArtifactFiles` | Individual file content per revision |
| `skillArtifactScriptDescriptors` | Script metadata (capability, args schema, side effects, policy) |
| `skillArtifactProfiles` | Derived profiles (title, summary, keywords) |
| `skillArtifactCapsules` | Derived capsules with situation/problem/goal structure |
| `skillArtifactCapsuleKeywords` | GIN-indexed token arrays for lexical capsule search |
| `skillArtifactCapsuleEmbeddings` | pgvector 384-dim embeddings for semantic capsule search |
| `skillArtifactClientManifests` | Client-facing manifest metadata |
| `skillArtifactManifestReferences` | Reference file entries in manifests |
| `skillArtifactManifestAssets` | Asset file entries in manifests |
| `skillArtifactManifestScripts` | Script entries in manifests |
| `skillArtifactBoundaryContexts` | Artifact boundary context labels |
| `skillArtifactBoundaryVersions` | Artifact version constraints |
| `skillArtifactBoundaryPrerequisites` | Artifact prerequisites |
| `skillArtifactBoundarySignals` | Artifact signal matchers |
| `skillArtifactBoundaryExclusions` | Artifact exclusion rules |
| `skillArtifactBoundaryEvidence` | Artifact evidence references |
| `skillArtifactMaintenanceAssignments` | Artifact ownership and review tracking |
| `skillArtifactAgentReviews` | Automated agent review decisions with risk scores |
| `skillArtifactMetadataTable` | Submission counters and decision metadata |
| `artifactLifecycleEvents` | Audit trail of artifact state transitions |

Sequences: `skillArtifactIdSeq`

### labels -- Canonical Label Catalog

Semantic label identity, aliases, embeddings, and alignment pipeline.

| Table | Description |
|-------|-------------|
| `canonicalLabels` | Canonical label definitions with merge support (`active`, `merged`, `disabled`) |
| `labelAliases` | Observed raw label variants mapped to canonical labels |
| `canonicalLabelEmbeddings` | 384-dim pgvector embeddings per canonical label |
| `labelAlignmentEvents` | LLM/manual alignment decisions audit trail (`existing`, `new`, `unsure`) |

### retrieval -- Graph Index and Badcase Traces

| Table | Description |
|-------|-------------|
| `graphIndexDocuments` | GraphRAG-lite documents with nodes and edges (JSONB) |
| `retrievalBadcaseTraces` | Durable trace records for retrieval failure reproducibility |

### queue -- Task Queue and Workflows

| Table | Description |
|-------|-------------|
| `taskQueue` | Durable task queue with SKIP LOCKED dequeue, deduplication, and lease-based processing |
| `workflowRuns` | Workflow execution tracking with step name, attempt, and stats |

## Usage

```typescript
import {
  knowledgeEntries,
  knowledgeEmbeddings,
  candidates,
  auditTimestamps,
} from '@trapmap/persistence-schema';

// Use table definitions with Drizzle ORM
const db = drizzle(pool);

// Query knowledge entries
const entries = await db
  .select()
  .from(knowledgeEntries)
  .where(eq(knowledgeEntries.scope, 'global'));

// Use shared column factory in custom tables
import { pgTable, text } from 'drizzle-orm/pg-core';

const myTable = pgTable('my_table', {
  id: text('id').primaryKey(),
  ...auditTimestamps(),
});
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm typecheck` | Type-check without emitting |

## Constraints

- This package contains **only** schema definitions. It must not contain repository logic, service behavior, or route handlers.
- Frozen migration invariants (table names, column names, defaults, indexes, constraints) must not be changed without a corresponding migration.
- The HNSW vector indexes for `knowledgeEmbeddings` and `skillArtifactCapsuleEmbeddings` are created programmatically at server startup, not via Drizzle schema declarations.
- The GIN tsvector index on `knowledgeSearchDocuments.document` is created in migration 0005 (tsvector has no native Drizzle type).