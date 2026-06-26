# @trapmap/service-governance-review

Shared governance review service module for host assemblies.

## Owner Boundary

`governance-review` owns the governance command pipeline: review decisions, feedback, remediation, and maintenance/decay workbench flow. It **does not** own final knowledge aggregate mutation.

- **Data owner**: `review-queue`, `feedback-record`, `remediation-workbench`, `maintenance-decay-workbench`, `governance-audit`
- **Projection owner**: `review-queue-projection`, `feedback-operator-projection`, `maintenance-decay-operator-projection`
- **Does not own**: `knowledge-aggregate-final-mutation`, `knowledge-lifecycle-authoritative-tables`, `retrieval-read-projection`

### Sync Boundary

`governance-review` only owns governance command receipt, eligibility checks, flow interpretation, and audit logging. Any final knowledge aggregate mutation must be delegated through `KnowledgeWritePort`. A local fallback that writes knowledge aggregates directly is **not allowed**.

### Async Boundary

Follow-up actions after approve/reject/maintenance/decay (retrieval projection refresh, artifact follow-up, remediation draft, badcase export draft) enter the outbox/queue/workflow as async follow-up and never return to the synchronous command path. `job-runtime` owns queue/outbox/workflow transport, lease, reclaim, and dead-letter runtime.

## Command Surface

The frozen delegation command surface that `governance-review` invokes against `knowledge-write`:

- `approve` -> `KnowledgeWritePort.approveReviewDecision`
- `reject` -> `KnowledgeWritePort.rejectReviewDecision`
- `applyMaintenance` -> `KnowledgeWritePort.applyMaintenanceDecision`
- `applyDecay` -> `KnowledgeWritePort.applyDecayDecision`
- `reviewArtifact` (local artifact review)
- `submitFeedback` (local feedback record creation)

Candidate publish is owned by `candidate-ingestion` but also flows through `KnowledgeWritePort.publishCandidateResult`; `governance-review` does not own this path.

## Failure Semantics

`governance-review` and `knowledge-write` share a single `InvocationError` taxonomy. HTTP status codes are mapped consistently across gateway, governance-review, and knowledge-write:

- `403 forbidden` - actor lacks governance eligibility or permission for this command
- `404 not-found` - target entry/candidate/artifact does not exist, or owner cannot locate canonical aggregate
- `409 conflict` - state conflict, duplicate application, or lifecycle precondition not met
- `503 unavailable` - owner service or a critical dependency is currently unavailable; preserves `unavailable` semantics
- `504 timeout` - cross-owner call timed out; preserves `timeout` semantics
- `401` remains a gateway/auth transport concern and does not enter the inter-owner failure taxonomy

Idempotency keys use `teamId + commandName + clientRequestId` (or equivalent canonical key). Retry replays the same command contract without rewriting the business payload. Dead-letter operator action is either requeue/replay or declaring the event expired; "retry-and-hope" is not allowed.

## Health / Readiness / Ownership Endpoints

- `GET /internal/health` - basic liveness with owner declaration
- `GET /internal/readiness` - dependency reachability (optionally checks delegation target), reports `finalAggregateMutation: 'delegated-to-knowledge-write'` and `followUpDisposition: 'outbox-queue-workflow-async'`
- `GET /internal/ownership` - full static owner declaration (data/projection ownership, doesNotOwn list, command surface, delegateTo target)

Operator visibility targets:

- **Command-received but final apply not complete**: visible through the governance-review readiness surface and governance-audit log
- **Final apply complete but follow-up not converged**: visible through knowledge-write readiness surface and job-runtime queue/outbox snapshots

## Compatibility / Delegation Exceptions

- **Shared PostgreSQL (transitional)**: continues to share the PostgreSQL instance with `knowledge-write` and other services, but with explicit schema/table owner. `governance-review` does not treat knowledge aggregate tables as its default write surface.
- **Named query seam**: if `governance-review` reads knowledge summaries, it does so only through a documented query seam or read-only projection.

## Verification

- `rtk pnpm test:distributed-acceptance` - proves multi-process delegation, error mapping, and request/trace propagation
- `rtk pnpm --filter @trapmap/service-governance-review test --run` - route-level governance and failure semantics
- `rtk pnpm typecheck`

## Related Documentation

- Pilot plan: [`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md`](../../docs/todos/nestjs-service-evolution-knowledge-write-governance-review-pilot.md)
- Migration task list: [`docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md`](../../docs/todos/nestjs-service-evolution-knowledge-write-governance-review-migration-tasklist.md)
- Maturity assessment: [`docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md`](../../docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md)
- Truth sources: [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../../docs/reference/SYSTEM_TRUTH_SOURCES.md)
