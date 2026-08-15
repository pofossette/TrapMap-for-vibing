# Trap-Map Wave-4 Governance Review Ownership Design

**Status:** approved for implementation

**Goal:** Make `governance-review` the only owner of feedback, conflict, remediation, and operator projections while preserving the existing distributed public API and moving lifecycle conflict work onto a consumable `job-runtime` workflow.

## Scope and invariants

This design completes Wave-4 only. It does not change Wave-5 or later ownership work and does not remove `store_snapshot`, `JsonStore`, `PostgresStore`, or their Wave-9 migration/backfill surface.

The following invariants must hold when Wave-4 closes:

- `server` does not read `store.snapshot()` for conflict detection, persist feedback/conflicts/remediation data, register feedback-admin routes, or construct the corresponding compatibility repositories.
- `runtime-infra` does not expose feedback, conflict, remediation, or badcase-export members through its aggregate.
- `governance-review` owns the conflict detection algorithm, canonical conflict persistence, feedback admin queries and mutations, remediation commands, batch/statistics operations, and operator projections.
- `job-runtime` owns task enqueueing, task consumption, lease/reclaim behavior, retry policy, and dead-letter handling. It does not own governance data or conflict policy.
- Cross-owner code uses contracts/backend-core ports, internal HTTP, or outbox delivery. No service imports another service's concrete implementation.
- Existing public distributed URLs, authentication actor selection, trace/correlation header propagation, and canonical error status/body semantics remain unchanged.

## Ownership architecture

### Conflict workflow

The canonical task is `governance.conflict-detection`. Its payload contains the approved `entryId` and the source lifecycle event identity needed for idempotent scheduling. The lifecycle subscriber schedules the task with a stable dedupe key derived from the approved entry and source event. It returns the scheduling error to the outbox worker so a transport failure remains retryable; it never performs conflict reads or writes itself.

`job-runtime` registers a typed handler for this task through a backend-core port. The handler validates the payload, invokes the injected governance conflict workflow, and lets dependency failures escape so the queue can apply its existing retry, lease, and dead-letter rules. A missing entry or an entry that is no longer approved is a successful no-op, matching the current detector behavior and preventing stale lifecycle events from becoming permanent dead letters.

The handler is available in both host shapes:

- Host-local composition injects the governance workflow port directly into the queue consumer.
- Distributed composition supplies an internal HTTP adapter from the job-runtime worker to the governance-review internal command. The adapter carries trace/correlation context and maps the existing invocation error contract; it does not import governance implementation code.

### Governance conflict owner

The governance workflow reads approved entries through a contracts/backend-core read port supplied by the host. The read port returns only the newly approved entry and the approved comparison candidates needed by the detector. Host-local composition wires the port directly; distributed composition uses the existing internal service boundary to reach the knowledge-read owner. The detector remains pure with respect to transport and store implementation.

The workflow applies the existing two-stage behavior: Jaccard candidate filtering, optional LLM classification, and deterministic fallback classification. It canonicalizes the pair ordering, skips an existing pair, allocates an owner-local conflict ID, and calls the already-established `ConflictReadProjection` owner bundle upsert. The upsert is idempotent on the canonical pair and therefore safe under queue redelivery.

Conflict reads used by retrieval remain projection reads. Knowledge-read receives a `ConflictReadProjection` port, and enrichment uses the shared contracts helper; no retrieval path imports `packages/server/src/lib/conflict`.

## Feedback, remediation, and operator API

`service-governance-review` gains internal handlers for the existing feedback-admin surface:

- list feedback;
- batch update/resolve feedback;
- entry statistics;
- remediation list and entry detail;
- remediation completion.

The service also exposes the internal conflict workflow command and any owner-local projection/status query required by the gateway or operator host. Validation uses the existing contracts schemas. Admin actor identity comes from the authenticated internal request context; a body actor cannot override it. Existing invocation errors are translated to the established `400/403/404/409/503/504/500` status mapping.

The distributed gateway adds forwarding for the existing public URLs:

- `GET /v1/operations/feedback`
- `POST /v1/operations/feedback/batch`
- `GET /v1/operations/feedback/stats/:entryId`
- `GET /v1/operations/feedback/remediation`
- `GET /v1/operations/feedback/remediation/:entryId`
- `POST /v1/operations/feedback/remediation/:entryId/complete`

Forwarding reuses `callInternalService()` and the existing gateway authentication hooks. Query strings, request bodies, authenticated actor headers, trace headers, correlation headers, response status, and canonical error bodies are passed through without introducing a second public route shape.

## Deletion and boundary changes

After owner routes and consumers are green, remove the server feedback-admin route registration and route modules, server feedback/conflict/remediation repositories and compatibility adapters, the server conflict subscriber and production conflict detector implementation, and the server task handler entry that directly owns governance conflict work. Remove only the feedback/conflict/remediation/badcase-export members from the `runtime-infra` repository aggregate and its construction path. Replace retrieval's server conflict enrichment import with the contracts projection helper before deleting the server conflict directory.

The retirement guard remains an explicit deletion contract during implementation. Wave-4 allowlist entries are not removed until all production references are gone and the full closeout evidence is green. Only then may `wave-4` be added to `completedOwnerWaves`, the Wave-4 allowlist entries be deleted, and the active detail/architecture documentation be updated. Wave-5+ entries and all Wave-9 snapshot state remain untouched.

## Error and delivery semantics

| Situation | Expected behavior |
| --- | --- |
| Approved lifecycle event is duplicated | Stable task dedupe plus canonical-pair idempotent upsert prevents duplicate relations. |
| Entry is missing or no longer approved | Workflow completes with an empty/no-op result. |
| Knowledge-read or governance database is unavailable | Handler throws; job-runtime retains retry/lease/dead-letter ownership. |
| Conflict detector finds no qualifying pair | Task completes successfully without a persistence write. |
| Public admin request is invalid/unauthorized/not found/conflicting | Gateway preserves the existing status and canonical `{ error, kind }` response. |
| Internal owner call times out | Existing internal-client timeout/error mapping is returned; no server fallback is attempted. |

No environment startup failure, missing dependency, or unavailable external service is counted as feature validation success.

## TDD and validation strategy

Each tranche follows RED → GREEN → focused regression → commit:

1. Add contracts/backend-core tests for the conflict task payload, workflow port, handler dispatch, no-op behavior, retryable error propagation, and idempotent owner upsert. Run the focused test and record a genuine missing-behavior RED before production code.
2. Implement the governance conflict workflow and queue handler; run governance, job-runtime, host-local/distributed workflow tests, `pnpm typecheck`, and `git diff --check`.
3. Add governance feedback-admin/remediation internal route tests and gateway forwarding/actor/header/error tests, then remove server route registration only after the new owner path is green.
4. Delete server conflict/feedback/remediation compatibility files and runtime-infra aggregate members; update retrieval projection imports and run boundary/guard tests.
5. Remove the Wave-4 allowlist and update `completedOwnerWaves` and active documentation only after the guard, focused tests, typecheck, and diff check are green.

Final closeout must include the retirement guard, `pnpm eval:smoke`, `pnpm test:deployment-smoke`, `pnpm check:docs-drift`, `pnpm check:structure`, and the Fallow new-only boundary audit. Every commit stages only files belonging to its tranche; the six pre-existing formatting changes remain unstaged.
