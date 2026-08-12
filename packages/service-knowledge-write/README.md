
# @trapmap/service-knowledge-write

Authoritative write-side service for the TrapMap knowledge system. Owns knowledge entries, traps, skill artifacts, evidence records, lifecycle rules, and the canonical label catalog.

## Boundary Ownership

`knowledge-write` owns the knowledge write model, final aggregate mutations, and lifecycle rules. It accepts delegated calls from `governance-review` (review/maintenance/decay decisions) and `candidate-ingestion` (candidate publishing).

- **Data ownership**: `knowledge-aggregate`, `knowledge-lifecycle`, `trap-aggregate`, `evidence-record`, `knowledge-revision`, `lifecycle-event`, `skill_artifacts`, `artifact_revisions`, `artifact_lifecycle_events`, `skill_artifact_files`, canonical label catalog (`canonical_labels`, `label_aliases`, `label_alignment_events`)
- **Projection ownership**: none (read-side projections owned by `knowledge-read`)
- **Does not own**: `governance-command-flow`, `review-queue`, `feedback-record`, `candidate-ingestion-workflow`, `retrieval-read-projection`

### Sync boundary

`knowledge-write` owns final aggregate mutation, lifecycle rules, and authoritative write truth. It does not own governance command flow judgment itself. The only authoritative path to change knowledge lifecycle state is through this service.

### Async boundary

Follow-up actions after aggregate mutation (retrieval projection refresh, artifact/skill follow-up, outbox event dispatch) enter outbox/queue/workflow as async follow-up and never return to the synchronous command path. `job-runtime` owns queue/outbox/workflow transport. `knowledge-write` is responsible for emitting authoritative write-side events; downstream consumers read named event/task types rather than relying on implicit side effects.

## Public API

### Entry point

```ts
import {
  createKnowledgeWriteServer,
  createKnowledgeWriteDeps,
  runKnowledgeWriteMigrations,
  registerKnowledgeWriteRoutes,
  registerArtifactRoutes,
} from '@trapmap/service-knowledge-write';
```

Secondary entry for graph alignment:

```ts
import { alignGraphNodes, rewriteEdgeIds } from '@trapmap/service-knowledge-write/labels/graph-align.js';
```

### Key exports

| Export | Description |
|---|---|
| `createKnowledgeWriteServer` | Create a Fastify server with all knowledge-write and artifact routes |
| `createKnowledgeWriteDeps` | Compose dependency adapters from `KnowledgeWritePortDeps` |
| `createKnowledgeWriteServiceModule` | Create the `KnowledgeWritePort` implementation from deps |
| `registerKnowledgeWriteRoutes` | Register knowledge-write HTTP routes on an existing Fastify instance |
| `registerArtifactRoutes` | Register artifact HTTP routes on an existing Fastify instance |
| `runKnowledgeWriteMigrations` | Run Drizzle migrations for knowledge-write-owned tables |
| `assertKnowledgeWriteMigrationSet` | Verify the migration set is complete |
| `createKnowledgeWriteOwnerBundle` | Create the full PostgreSQL-backed owner bundle (knowledge owner + artifact ports) |
| `createKnowledgeWriteOutboxDiagnostics` | Create outbox status diagnostics for operator visibility |
| `createArtifactReadProjection` | Create the artifact read projection from a pg Pool |
| `createArtifactWritePort` | Create the artifact write port from a pg Pool |
| `createArtifactBundleImportPort` | Create the artifact bundle import port from a pg Pool |
| `createArtifactFilePayloadOwner` | Create the artifact file payload store from a pg Pool |
| `backfillLabels` | Backfill the canonical label catalog from historical data |
| `alignLabel` | LLM-powered label alignment against the canonical catalog |
| `repairGraphDocuments` | Repair graph documents after a label merge |
| `PgLabelRepository` | PostgreSQL-backed canonical label repository |
| `createLabelReadProjection` | Create the label read projection |
| `alignGraphNodes` | Align raw extracted graph nodes against the canonical label catalog |
| `rewriteEdgeIds` | Rewrite edge node IDs using an alignment mapping |

### Types

| Type | Description |
|---|---|
| `KnowledgeWriteServiceConfig` | Server config: `host`, `port`, `logLevel` |
| `KnowledgeWriteServer` | Server handle with `app`, `module`, `start()`, `close()` |
| `KnowledgeWriteDeps` | Dependencies for the write module |
| `KnowledgeWritePortDeps` | Port-level dependency shape for composing deps |
| `KnowledgeWriteOwnerBundle` | Full PostgreSQL owner bundle (knowledge owner + artifact ports) |
| `KnowledgeWriteOutboxDiagnostics` | Outbox status snapshot interface |
| `ArtifactWritePort` | Artifact write operations interface |
| `ArtifactBundleImportPort` | Artifact bundle import interface |
| `ArtifactFilePayloadOwner` | Artifact file payload get/put interface |
| `ArtifactReadProjection` | Artifact read projection interface |
| `BackfillOptions` / `BackfillReport` | Label backfill configuration and result |
| `LabelRepository` / `CanonicalLabelRecord` / `LabelAliasRecord` | Canonical label catalog types |
| `LabelAlignmentResult` | LLM label alignment result |
| `MergeRepairOptions` / `MergeRepairReport` | Graph document merge repair config and result |

## HTTP Endpoints

### Knowledge write

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/knowledge` | Submit a new knowledge entry |
| `PUT` | `/internal/knowledge/:entryId` | Update entry content/labels |
| `POST` | `/internal/knowledge/:entryId/resubmit` | Resubmit entry for review |
| `POST` | `/internal/knowledge/:entryId/supersede` | Supersede entry with replacement |
| `GET` | `/internal/knowledge/:entryId/conflict-candidates` | List approved conflict candidates |

### Review / maintenance / decay

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/knowledge/review/approve` | Approve a review decision |
| `POST` | `/internal/knowledge/review/reject` | Reject a review decision |
| `POST` | `/internal/knowledge/maintenance` | Apply maintenance decision |
| `POST` | `/internal/knowledge/decay` | Apply decay decision |
| `POST` | `/internal/candidates/publish` | Publish candidate result |

### Traps

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/traps` | Create a trap aggregate |
| `GET` | `/internal/traps` | List traps (optional `teamId` query) |
| `GET` | `/internal/traps/:trapId` | Get trap by ID |

### Artifacts

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/artifacts/import` | Import artifact bundles |
| `POST` | `/internal/artifacts/export` | Export artifacts |
| `GET` | `/internal/artifacts/review-queue` | List submitted artifacts awaiting review |
| `GET` | `/internal/artifacts/:artifactId` | Get artifact by ID |
| `POST` | `/internal/artifacts/:artifactId/lifecycle` | Update artifact lifecycle state |
| `POST` | `/internal/artifacts/:artifactId/edit` | Edit artifact metadata |
| `GET` | `/internal/artifacts/:artifactId/history` | Get artifact revision history |
| `POST` | `/internal/artifacts/:artifactId/review` | Approve or reject artifact |
| `POST` | `/internal/artifacts/activate` | Activate artifact |
| `POST` | `/internal/artifacts/:artifactId/deactivate` | Deactivate artifact |

### RPC endpoint

`POST /internal/rpc/knowledge-write`

Unified RPC endpoint for cross-process callers to invoke delegated commands via a single HTTP entry point. Request body contains `method` and `input` fields.

| method | Description |
|---|---|
| `approveReviewDecision` | Approve review decision |
| `rejectReviewDecision` | Reject review decision |
| `applyMaintenanceDecision` | Apply maintenance decision |
| `applyDecayDecision` | Apply decay decision |
| `publishCandidateResult` | Publish candidate result |

### Health / readiness / ownership

| Method | Path | Description |
|---|---|---|
| `GET` | `/internal/health` | Liveness with owner claim and delegation sources |
| `GET` | `/internal/live` | Dependency-free liveness probe |
| `GET` | `/internal/readiness` | Persistence reachability, `aggregateMutationAuthority`, `lifecycleRuleAuthority` |
| `GET` | `/internal/ready` | Alias for `/internal/readiness` |
| `GET` | `/internal/ownership` | Full static ownership declaration |
| `GET` | `/internal/operator-status` | Pool health, outbox diagnostics, timeout/idempotency diagnostics |

## Usage

### Standalone server

```ts
import { createKnowledgeWriteServer, createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { createKnowledgeWriteOwnerBundle } from '@trapmap/service-knowledge-write';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const bundle = createKnowledgeWriteOwnerBundle(pool);

const server = await createKnowledgeWriteServer(
  { host: '0.0.0.0', port: 3100, logLevel: 'info' },
  createKnowledgeWriteDeps({
    knowledgeOwner: bundle.knowledgeOwner,
    auditLog: { log: () => {} },
    artifactWriter: bundle.artifactWriter,
    artifactReadProjection: bundle.artifactReadProjection,
    artifactBundleImporter: bundle.artifactBundleImporter,
  }),
);

await server.start();
```

### Embedding in an existing Fastify app

```ts
import { registerKnowledgeWriteRoutes, createKnowledgeWriteServiceModule } from '@trapmap/service-knowledge-write';

const module = createKnowledgeWriteServiceModule(deps);
registerKnowledgeWriteRoutes(app, module, {
  checkDependency: async () => ({ reachable: true }),
  getOperatorStatus: async () => ({ /* custom diagnostics */ }),
});
```

### Running migrations

```ts
import { runKnowledgeWriteMigrations } from '@trapmap/service-knowledge-write';

await runKnowledgeWriteMigrations(pool);
```

### Graph node alignment

```ts
import { alignGraphNodes, rewriteEdgeIds } from '@trapmap/service-knowledge-write/labels/graph-align.js';

const { nodes, nodeIdMapping } = await alignGraphNodes(rawNodes, {
  chat: chatProvider,
  repository: labelRepository,
  embeddings: embeddingsProvider,
});
const alignedEdges = rewriteEdgeIds(rawEdges, nodeIdMapping);
```

## Command Surface

The full command surface exposed by `knowledge-write`:

| Command | Source |
|---|---|
| `submit` | Direct |
| `updateEntry` | Direct |
| `resubmit` | Direct |
| `supersede` | Direct |
| `createTrap` | Direct |
| `approveReviewDecision` | Delegated from `governance-review` |
| `rejectReviewDecision` | Delegated from `governance-review` |
| `applyMaintenanceDecision` | Delegated from `governance-review` |
| `applyDecayDecision` | Delegated from `governance-review` |
| `publishCandidateResult` | Delegated from `candidate-ingestion` |
| `listTraps` / `getTrap` | Direct (sync, local to owner) |

All delegated commands enter through `KnowledgeWritePort`. No route-level or repository-level bypass is allowed.

## Failure Semantics

`knowledge-write` shares the same `InvocationError` classification as all other owners. HTTP status mapping:

| Status | Meaning |
|---|---|
| `403` | Actor lacks write permission |
| `404` | Target entry/trap/candidate not found or cannot locate authoritative aggregate |
| `409` | State conflict, duplicate application, or lifecycle precondition not met |
| `503` | Service or critical persistence dependency unavailable |
| `504` | Reserved for cross-owner caller timeout interpretation |

Idempotency: Repeated execution of the same governance/candidate command against `knowledge-write` must produce identical aggregate mutation results. Outbound retries replay the same authoritative events and never compute a second aggregate mutation.

## Async Capability Boundary

`knowledge-write` appends local outbox events within the authoritative transaction, but queue/outbox claim, complete, fail, requeue, retry, and dead-letter runtime operations belong to `job-runtime`. Operator status exposes read-only snapshots only; the service must not gain runtime mutation capability from that diagnostic surface.

## Dependencies

### TrapMap workspace packages

| Package | Usage |
|---|---|
| `@trapmap/backend-core` | `KnowledgeWritePort` interface, `InvocationError`, `createKnowledgeWriteModule`, `assertOwnerMigrationSet` |
| `@trapmap/contracts` | Shared types (`KnowledgeOwnerPort`, `ArtifactReadProjection`, lifecycle states, artifact schemas, label types) |
| `@trapmap/persistence-schema` | Drizzle schema definitions (re-exported via `schema.ts`) |
| `@trapmap/ai-providers` | `ChatProvider`, `EmbeddingsProvider` for LLM label alignment (used by `labels/` subpackage) |

### External dependencies

| Package | Usage |
|---|---|
| `fastify` | HTTP server framework |
| `drizzle-orm` | Database migration runner |
| `pg` | PostgreSQL client |

## Database Tables

Knowledge-write owns the following tables:

- `knowledge_entries` -- knowledge entry aggregates
- `knowledge_labels` -- entry-to-label join table
- `knowledge_revisions` -- entry revision history
- `knowledge_submissions` -- submission history
- `knowledge_review_decisions` -- reviewer decisions
- `lifecycle_events` -- knowledge lifecycle event log
- `skill_artifacts` -- skill artifact aggregates
- `artifact_revisions` -- artifact revision history
- `artifact_lifecycle_events` -- artifact lifecycle event log
- `skill_artifact_files` -- artifact file payloads
- `domain_event_outbox` -- outbound event outbox
- `canonical_labels` -- canonical label catalog
- `label_aliases` -- label alias mappings
- `label_alignment_events` -- LLM alignment event log

## Tests

| File | Covers |
|---|---|
| `src/routes.test.ts` | Knowledge-write route registration and failure semantics |
| `src/artifact-routes.test.ts` | Artifact route registration |
| `src/artifact-ports.test.ts` | Artifact write port, read projection, bundle import |
| `src/pg-ports.test.ts` | `createKnowledgeWriteOwnerBundle`, outbox diagnostics |
| `src/migrations.test.ts` | Migration assertion |
| `src/labels/backfill.test.ts` | Label backfill |
| `src/labels/candidate-recall.test.ts` | Candidate recall |
| `src/labels/llm-align.test.ts` | LLM label alignment |
| `src/labels/merge-repair.test.ts` | Graph document merge repair |
| `src/labels/repository.test.ts` | Label repository |

Run tests:

```bash
pnpm --filter @trapmap/service-knowledge-write test
```

## Compatibility Notes

- **Shared PostgreSQL (transitional)**: Continues to share a PostgreSQL instance with other services but has explicit schema/table ownership. `knowledge-write` authoritatively owns knowledge/trap/evidence/lifecycle/artifact/label tables.
- **Named query seams**: Read-side consumers (`knowledge-read`, operational projections) read through named projection seams or derived search indexes; they do not bypass `knowledge-write` by directly writing to knowledge tables.

## Related Documentation

- Pilot plan: `docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`
- Migration tasklist: `docs/archived/archived-plans/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`
- Maturity assessment: `docs/archived/archived-plans/nestjs-service-evolution-distributed-maturity-assessment.md`
- Truth sources: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
