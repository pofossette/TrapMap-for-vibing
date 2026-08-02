
# @trapmap/service-governance-review

Fastify-based governance review service. Owns the governance command pipeline: review decisions (approve/reject), feedback submission and admin workflows, conflict detection, remediation lifecycle, and maintenance/decay workbench flows. Final knowledge aggregate mutations are delegated to `knowledge-write` via `KnowledgeWritePort`.

## Boundary Ownership

### Data Ownership

| Owned | Not Owned |
|---|---|
| `review-queue` | `knowledge-aggregate-final-mutation` |
| `feedback-record` | `knowledge-lifecycle-authoritative-tables` |
| `remediation-workbench` | `retrieval-read-projection` |
| `maintenance-decay-workbench` | |
| `governance-audit` | |

### Projection Ownership

`review-queue-projection`, `feedback-operator-projection`, `maintenance-decay-operator-projection`

### Sync Boundary

This service owns governance command receipt, eligibility check, flow interpretation, and audit logging. Any final knowledge aggregate mutation must be delegated through `KnowledgeWritePort`. Local direct-write fallback to knowledge aggregate tables is not allowed.

### Async Boundary

Post-approval/rejection/maintenance/decay follow-up actions (retrieval projection refresh, artifact follow-up, remediation draft, badcase export draft) enter outbox/queue/workflow as async follow-up and never return to the synchronous command path. `job-runtime` owns queue/outbox/workflow transport, lease, reclaim, and dead-letter runtime.

## Command Interface

Delegated commands through `KnowledgeWritePort`:

| Command | Delegated Method |
|---|---|
| `approve` | `KnowledgeWritePort.approveReviewDecision` |
| `reject` | `KnowledgeWritePort.rejectReviewDecision` |
| `applyMaintenance` | `KnowledgeWritePort.applyMaintenanceDecision` |
| `applyDecay` | `KnowledgeWritePort.applyDecayDecision` |
| `reviewArtifact` | Local artifact review |
| `submitFeedback` | Local feedback record creation |

Candidate publishing is owned by `candidate-ingestion` and flows through `KnowledgeWritePort.publishCandidateResult`; `governance-review` does not own this path.

## Package Structure

```text
src/
  index.ts                      Public barrel exports
  deps.ts                       Service module composition and dependency wiring
  server.ts                     Fastify server factory
  routes.ts                     HTTP route registration and error mapping
  admin.ts                      Feedback admin operations (list, stats, batch, remediation)
  async-commands.ts             Async command module (remediation reactivation, badcase export)
  conflict-workflow.ts          Conflict detection workflow (Jaccard + optional LLM)
  conflict-read.ts              Conflict read port (approved entry candidate lookup)
  llm-conflict.ts               LLM-powered conflict judgment (internal, not exported)
  pg-ports.ts                   PostgreSQL adapters for feedback repo, conflict projection, retrieval projection
  migrations.ts                 Drizzle migration runner
  snapshot-backfill.ts          Snapshot migration/backfill utilities
  review-queue-projection.ts    Review queue projection builders
  schema.ts                     Re-exports from @trapmap/persistence-schema
drizzle/
  0000_shiny_swarm.sql          Initial migration
```

## Public API

### Service Composition

```typescript
import {
  createGovernanceReviewDeps,
  createGovernanceReviewServiceModule,
  createGovernanceReviewServer,
} from '@trapmap/service-governance-review';

// Build deps from port implementations
const deps = createGovernanceReviewDeps({
  knowledgeWrite: myKnowledgeWritePort,
  feedbackRepo: myFeedbackRepo,
  auditLog: myAuditLog,
  asyncCommands: myAsyncCommands,        // optional
  conflictWorkflow: myConflictWorkflow,  // optional
  admin: myAdminModule,                  // optional
  governanceRetrievalProjection: myProjection, // optional
});

// Compose the service module
const module = createGovernanceReviewServiceModule(deps);

// Or create a standalone Fastify server
const server = await createGovernanceReviewServer(
  { host: '0.0.0.0', port: 3100, logLevel: 'info' },
  deps,
  {
    checkDependency: async () => ({ reachable: true }),
    getOperatorStatus: async () => ({ /* ... */ }),
  },
);
await server.start();
```

### PostgreSQL Adapters

```typescript
import { createGovernanceReviewPgOwnerBundle } from '@trapmap/service-governance-review';

const bundle = createGovernanceReviewPgOwnerBundle(pool);
// bundle.feedbackRepo     - FeedbackRepositoryPort implementation
// bundle.conflictProjection - ConflictReadProjection + upsert/getById
// bundle.retrievalProjection - GovernanceRetrievalProjection
```

### Migrations

```typescript
import {
  runGovernanceReviewMigrations,
  assertGovernanceReviewMigrationSet,
} from '@trapmap/service-governance-review';

// Assert migration set integrity
await assertGovernanceReviewMigrationSet();

// Run all pending migrations
await runGovernanceReviewMigrations(pool);
```

### Conflict Detection

```typescript
import {
  createGovernanceConflictWorkflow,
  classifyConflict,
  overlapScore,
  tokenize,
} from '@trapmap/service-governance-review';

// Create the conflict workflow with read port, projection, and optional LLM chat
const workflow = createGovernanceConflictWorkflow({
  read: myConflictReadPort,
  projection: myConflictProjection,
  chat: myLlmChatAdapter,  // optional LLM-powered judgment
});

// Detect conflicts for an entry
const result = await workflow.detectConflicts({ entryId: 'entry_123' });

// Standalone utilities
const tokens = tokenize('some knowledge entry text');
const score = overlapScore(setA, setB);
const type = classifyConflict(problemOverlap, solutionDiff); // 'contradictory' | 'alternative' | 'superseded' | null
```

### Review Queue Projection

```typescript
import { buildReviewQueueProjection } from '@trapmap/service-governance-review';

const projection = await buildReviewQueueProjection(repos, {
  auth: { subjectType: 'user', activeTeamId: 'team_1', securityLevel: 5 },
  status: 'submitted', // optional filter
});
// projection.items - ReviewQueueItem[]
// projection.total - number
```

### Snapshot Backfill

```typescript
import { migrateGovernanceSnapshot } from '@trapmap/service-governance-review';

const result = await migrateGovernanceSnapshot({
  owner: { feedbackRepo: myRepo, conflictProjection: myProjection },
  snapshot: { feedbackQueue: [...], conflicts: [...] },
});
// result.migrated, result.skipped, result.errors, result.verified
```

## HTTP Routes

### Governance Commands

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/review/approve` | Approve a review entry |
| `POST` | `/internal/review/reject` | Reject a review entry |
| `POST` | `/internal/review/maintenance` | Apply maintenance decision |
| `POST` | `/internal/review/decay` | Apply decay decision |
| `POST` | `/internal/review/artifact` | Review an artifact (approve/reject) |
| `POST` | `/internal/conflicts/detect` | Detect conflicts for an entry |

### Feedback

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/feedback` | Submit feedback (requires `x-trapmap-actor-id` header) |
| `GET` | `/internal/feedback/admin` | List feedback with filters |
| `POST` | `/internal/feedback/admin/batch` | Batch resolve/dismiss/triage/transition feedback |
| `GET` | `/internal/feedback/admin/stats/:entryId` | Get quality stats for an entry |
| `GET` | `/internal/feedback/admin/remediation` | List remediation queue |
| `GET` | `/internal/feedback/admin/remediation/:entryId` | Get remediation detail |
| `POST` | `/internal/feedback/admin/remediation/:entryId/complete` | Complete remediation |

### Async Commands

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/feedback/async/remediation-reactivation` | Reactivate remediation |
| `POST` | `/internal/feedback/async/badcase-export-draft` | Export badcase draft |

### Retrieval Projection

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/governance-review/retrieval-projection` | List feedback and conflicts for given entry IDs |

### Health & Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/internal/health` | Basic liveness with ownership claim |
| `GET` | `/internal/live` | Liveness (no dependency check) |
| `GET` | `/internal/readiness` | Readiness with optional dependency reachability |
| `GET` | `/internal/ready` | Same as readiness |
| `GET` | `/internal/ownership` | Full static ownership declaration |
| `GET` | `/internal/operator-status` | Database, delegated owner, timeout, idempotency diagnostics |

## Error Semantics

`governance-review` and `knowledge-write` share a unified `InvocationError` classification. HTTP status codes are consistent across gateway, governance-review, and knowledge-write:

| Kind | Status | Meaning |
|---|---|---|
| `validation` | 400 | Invalid request payload |
| `forbidden` | 403 | Actor lacks governance eligibility or command permission |
| `not-found` | 404 | Target entry/candidate/artifact does not exist |
| `conflict` | 409 | State conflict, duplicate application, or lifecycle precondition not met |
| `unavailable` | 503 | Ownership service or critical dependency currently unavailable |
| `timeout` | 504 | Cross-ownership call timeout |

Idempotency keys use `teamId + commandName + clientRequestId` (or equivalent canonical key). Replayed operations repeat the same command contract without rewriting business payloads.

## Runtime Boundary

This service can read job-runtime queue/outbox operator snapshots but does not have enqueue, claim, retry, or dead-letter capability. Final writes to knowledge aggregate are always delegated to remote `knowledge-write`; on local `knowledge-write` restart the same idempotent command is retried without local direct-write fallback.

## Dependencies

### TrapMap Workspace Packages

| Package | Usage |
|---|---|
| `@trapmap/backend-core` | Port interfaces, `InvocationError`, `createGovernanceReviewModule` |
| `@trapmap/contracts` | Shared schemas and types (`ConflictRelation`, `FeedbackBatchRequest`, etc.) |
| `@trapmap/persistence-schema` | Drizzle table definitions (`feedbackRecords`, `feedbackCustomAnswers`) |

### External

| Package | Usage |
|---|---|
| `fastify` | HTTP server framework |
| `drizzle-orm` | Database migration runner |
| `pg` | PostgreSQL client |

## Tests

| Test File | Coverage |
|---|---|
| `src/admin.test.ts` | Feedback admin operations |
| `src/async-commands.test.ts` | Async command module |
| `src/conflict-read.test.ts` | Conflict read port |
| `src/conflict-workflow.test.ts` | Conflict detection workflow |
| `src/migrations.test.ts` | Migration runner |
| `src/pg-ports.test.ts` | PostgreSQL adapters |
| `src/review-queue-projection.test.ts` | Review queue projection |
| `src/routes.test.ts` | HTTP route handlers and error mapping |
| `src/server.test.ts` | Server factory |
| `src/snapshot-backfill.test.ts` | Snapshot backfill utilities |

## Validation

```bash
# Package-level tests
rtk pnpm --filter @trapmap/service-governance-review test --run

# Type checking
rtk pnpm typecheck

# Distributed acceptance (multi-process delegation, error mapping, request/trace propagation)
rtk pnpm test:distributed-acceptance
```

## Related Docs

- Pilot plan: [`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)
- Migration tasklist: [`docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](../../docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)
- Maturity assessment: [`docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md`](../../docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md)
- System truth sources: [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
