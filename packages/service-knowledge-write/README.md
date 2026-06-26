# @trapmap/service-knowledge-write

Shared knowledge write service module for host assemblies.

## Owner Boundary

`knowledge-write` owns the knowledge write model, final aggregate mutation, and lifecycle rules. It accepts delegation from `governance-review` (for review/maintenance/decay decisions) and `candidate-ingestion` (for candidate publish).

- **Data owner**: `knowledge-aggregate`, `knowledge-lifecycle`, `trap-aggregate`, `evidence-record`, `knowledge-revision`, `lifecycle-event`
- **Projection owner**: none (read-side projections are owned by `knowledge-read`)
- **Does not own**: `governance-command-flow`, `review-queue`, `feedback-record`, `candidate-ingestion-workflow`, `retrieval-read-projection`

### Sync Boundary

`knowledge-write` owns final aggregate mutation, lifecycle rules, and authoritative write truth. It does not own governance command flow judgment itself. The only authoritative path to change knowledge lifecycle state is through this service.

### Async Boundary

Follow-up actions after aggregate mutation (retrieval projection refresh, artifact/skill follow-up, outbox event dispatch) enter the outbox/queue/workflow as async follow-up and never return to the synchronous command path. `job-runtime` owns queue/outbox/workflow transport. `knowledge-write` is responsible for triggering authoritative write-side events; downstream consumers read named event/task types rather than relying on implicit side effects.

## Command Surface

The full command surface exposed by `knowledge-write`:

- `submit` - new knowledge entry
- `updateEntry` - content/label update
- `resubmit` - resubmission flow
- `supersede` - supersession by replacement
- `createTrap` - trap aggregate creation
- `approveReviewDecision` - delegated from `governance-review`
- `rejectReviewDecision` - delegated from `governance-review`
- `applyMaintenanceDecision` - delegated from `governance-review`
- `applyDecayDecision` - delegated from `governance-review`
- `publishCandidateResult` - delegated from `candidate-ingestion`
- `listTraps` / `getTrap` - trap query (sync, local to owner)

All delegated commands enter through `KnowledgeWritePort`. No route-level or repo-level bypass is permitted.

## Failure Semantics

`knowledge-write` shares the same `InvocationError` taxonomy as every other owner. HTTP status codes are mapped consistently:

- `403 forbidden` - actor lacks permission for this write
- `404 not-found` - target entry/trap/candidate does not exist or canonical aggregate cannot be located
- `409 conflict` - state conflict, duplicate application, or lifecycle precondition not met
- `503 unavailable` - service or a critical persistence dependency is currently unavailable
- `504 timeout` - reserved for cross-owner callers to interpret call timeouts; `knowledge-write` itself rarely raises this
- `401` remains a gateway/auth transport concern

Idempotency: the same governance/candidate command replayed against `knowledge-write` must yield the same aggregate mutation outcome. Outbox retry replays the same canonical event and never computes a second aggregate mutation. Dead-letter operator action is either requeue/replay or declaring the event expired.

## Health / Readiness / Ownership Endpoints

- `GET /internal/health` - basic liveness with owner declaration and delegation-source list
- `GET /internal/readiness` - persistence reachability, reports `aggregateMutationAuthority: true`, `lifecycleRuleAuthority: true`, and `followUpDisposition: 'outbox-queue-workflow-async'`
- `GET /internal/ownership` - full static owner declaration (data/projection ownership, doesNotOwn list, command surface, acceptsDelegationFrom list)

Operator visibility targets:

- **Final write complete but follow-up not converged**: visible through this service's readiness and job-runtime queue/outbox snapshots
- **Stale processing / reclaim**: interpreted as a `job-runtime` runtime-owner behavior, not a `knowledge-write` business-semantic drift

## Compatibility / Delegation Exceptions

- **Shared PostgreSQL (transitional)**: continues to share the PostgreSQL instance with other services, but with explicit schema/table owner. `knowledge-write` owns the knowledge/trap/evidence/lifecycle tables authoritatively.
- **Named query seam**: read-side consumers (`knowledge-read`, operator projections) read through named projection seams or derived search indexes; they do not bypass `knowledge-write` by writing to knowledge tables directly.

## Verification

- `rtk pnpm test:distributed-acceptance` - proves multi-process delegation, error mapping, and request/trace propagation
- `rtk pnpm --filter @trapmap/service-knowledge-write test --run` - route-level command and failure semantics
- `rtk pnpm typecheck`

## Related Documentation

- Pilot plan: [`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)
- Migration task list: [`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](../../docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)
- Maturity assessment: [`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](../../docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)
- Truth sources: [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
