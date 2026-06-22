# Service Boundaries

> Frozen by Task 00 of the runtime recomposition plan. This document defines the service role definitions, their authoritative ownership, internal communication contracts, and the rules governing interaction between services.

## Status

- Phase: 1 (logical boundaries defined; physical process separation incremental)

## Service Inventory

| Service | Package | Bounded context |
|---|---|---|
| `gateway` | `packages/service-gateway` | External API surface, request aggregation |
| `identity-access` | `packages/service-identity-access` | Auth, session, access-keys, membership, team, RBAC |
| `knowledge-read` | `packages/service-knowledge-read` | Retrieval, read projections, query trace, read cache |
| `knowledge-write` | `packages/service-knowledge-write` | Knowledge/trap/skill/lifecycle/maintenance/decay writes |
| `candidate-ingestion` | `packages/service-candidate-ingestion` | Candidate intake, normalization, dedup, status advancement |
| `governance-review` | `packages/service-governance-review` | Review queues, workbench, conflict resolution, remediation |
| `job-runtime` | `packages/service-job-runtime` | Task queue, workflow runs, outbox dispatch, shared jobs |

## Service Definitions

### gateway

**Purpose**: The single external entry point for all clients (CLI, web, external integrations).

**Responsibilities**:
- API surface stability (versioned endpoints, backward compatibility)
- Request routing to appropriate backend-core application services
- Request aggregation (combining results from multiple internal calls into a single response when needed)
- Rate limiting and throttling
- External auth boundary enforcement (token validation, session resolution)
- Unified error response format
- Health and readiness endpoints

**Does NOT**:
- Hold any business domain state
- Implement business logic (retrieval scoring, RBAC decision computation, lifecycle state machine)
- Own any authoritative database tables
- Perform writes to any domain tables

**Internal ports consumed**: `IdentityAccessPort` (auth middleware), `KnowledgeReadPort` (retrieval queries), `KnowledgeWritePort` (lifecycle commands), `CandidateIngestionPort` (candidate submission), `GovernanceReviewPort` (review queue queries), `JobRuntimePort` (status queries)

**External boundary**: This is the only service reachable from outside the system. All external traffic enters here.

### identity-access

**Purpose**: Centralized auth, identity, and access control.

**Responsibilities**:
- User authentication (login, session creation, session validation)
- Session lifecycle management (refresh, expiry, revocation)
- Access-key generation, validation, and revocation
- Team CRUD operations
- Membership management (add/remove members, role assignment)
- RBAC decision computation (permission checks, role template resolution, security level enforcement)
- Actor lookup (resolving actor references for audit and authorization)

**Authoritative tables**: auth, session, access-key, user, team, membership tables

**Provides to other services**:
- `IdentityAccessPort`: permission checks, actor resolution, team validation
- Other services call this port rather than querying identity tables directly

**Consumers**: gateway (every authenticated request), all other services (authorization before writes)

### knowledge-read

**Purpose**: Optimized read path for retrieval, search, and query analytics.

**Responsibilities**:
- Retrieval query execution (v1 semantic/hybrid/graph-assisted, v2 capsule, v3 graph-plan)
- Query tracing and analytics (queryId generation, badcase trace recording)
- Read-only projection maintenance (denormalized read models, materialized views)
- Status read model (operator-facing status queries for knowledge, artifacts, decay, maintenance)
- Read-side cache management (retrieval read-model cache, intent cache, embedding cache)
- Search index management (knowledge_embeddings, knowledge_keywords, knowledge_search_documents, graph_index_documents)

**Authoritative tables**: None (all tables this service writes to are derived projections)

**Derived tables it writes**:
- Search index tables (embeddings, keywords, search documents, graph index)
- Query trace read-side tables (retrieval_badcase_traces)
- Projection cache metadata

**Projection responsibility**: Rebuilds read-side state from events emitted by `knowledge-write`. The write side is responsible for invalidation triggers; the read side consumes them.

**Does NOT own**: Any authoritative write path for knowledge, trap, skill, lifecycle, maintenance, or decay

### knowledge-write

**Purpose**: Authoritative write path for the knowledge domain.

**Responsibilities**:
- Knowledge entry creation, update, resubmission, and supersession
- Trap lifecycle management (submit, approve, reject, deactivate)
- Skill artifact lifecycle management (import, edit, review, activate)
- Lifecycle state machine enforcement (draft -> submitted -> agent-pass/rejected -> approved/rejected -> deactivated)
- Maintenance assignment and verification
- Decay state computation and management
- Evidence metadata management
- Feedback recording and processing
- Lifecycle transition event emission (to outbox for projection invalidation)

**Authoritative tables**: knowledge entries, knowledge labels, knowledge boundary tables, knowledge revisions, lifecycle events, skill artifacts, artifact revisions, skill_artifact_* structural tables, decay metadata, evidence metadata, feedback tables

**Emits**:
- Lifecycle transition events (via outbox)
- Invalidation events (for cache and projection refresh)
- Projection refresh triggers

**Does NOT own**: Retrieval read model, search index writes (those are projections owned by `knowledge-read`)

### candidate-ingestion

**Purpose**: Async intake and processing pipeline for new knowledge candidates.

**Responsibilities**:
- Candidate intake (receiving trap and skill submissions)
- Payload normalization (standardizing candidate data)
- Duplicate detection preprocessing (fingerprint computation, semantic similarity, exact lane matching)
- Candidate status advancement (received -> queued -> analyzing -> duplicate_detected / ready_for_review / resolved / error)
- Duplicate case creation and match recording
- Resolution outcome recording (independent publish or merge)
- Entity lineage tracking

**Authoritative tables**: candidates, candidate_analyses, candidate_manual_results, candidate_resolution_outcomes, candidate_duplicate_cases, candidate_duplicate_matches, entity_lineage

**Does NOT own**: Knowledge authoritative tables. When a candidate is resolved as "independent", the actual knowledge/skill entry creation is dispatched via the remote `KnowledgeWritePort` command to `knowledge-write`. In the distributed host, `candidate-ingestion` must not mark a candidate resolved before that remote publish succeeds, and it must not keep a local fallback write path to knowledge truth.

**Load profile**: Bursty, async-heavy. Receives submissions, then processes them through a multi-step pipeline. Suitable for independent scaling separate from the synchronous API path.

### governance-review

**Purpose**: Human-in-the-loop review workflows and conflict resolution.

**Responsibilities**:
- Review queue management (knowledge review queue, skill artifact review queue)
- Review workbench state (assigning reviewers, tracking review sessions)
- Conflict resolution workflows (when duplicate candidates require human judgment)
- Remediation queue management (feedback-driven remediation tasks)
- Suppression and reactivation state for knowledge entries (driven by feedback aggregation)

**Authoritative tables**: human intervention queues, review workbench state, conflict resolution state, remediation queue state tables

**Does NOT own**: Knowledge lifecycle truth tables. Review decisions (approve, reject, maintenance, decay) flow through the remote `KnowledgeWritePort` command; `knowledge-write` performs the authoritative lifecycle or aggregate mutation. `governance-review` must not keep direct repository writes to knowledge truth tables, even in the shared-PostgreSQL Phase 1 posture.

**Key constraint**: This service is more than a simple worker. It manages governance state machines and human workflow orchestration.

### job-runtime

**Purpose**: Shared async execution substrate.

**Responsibilities**:
- Task queue management (enqueue, dequeue, lease, reclaim, dead-letter)
- Workflow run tracking (long-running task snapshots, progress, completion)
- Outbox event dispatch (picking up outbox events and delivering to target services)
- Shared job execution (lifecycle index follow-up, remediation reactivation, badcase export draft generation, capsule index rebuild)
- Task retry, backoff, and failure handling

**Authoritative tables**: task_queue, workflow_runs, domain_event_outbox, outbox processing state, lease/reclaim metadata

**Does NOT own**: Any business domain truth tables. It only executes work dispatched by other services.

**Role clarification**: `job-runtime` is an infrastructure service. It provides the execution substrate that other services use to achieve eventual consistency. It does not make business decisions.

## Internal Communication

### Port-first design

All cross-service communication goes through internal ports defined in `backend-core`. Each port specifies:

- Request / response shape (typed, in `backend-core`)
- Timeout / cancellation expectation
- Idempotency expectation
- Error taxonomy
- Tracing / correlation ID propagation

### Port inventory

| Port | Provided by | Consumers |
|---|---|---|
| `IdentityAccessPort` | `identity-access` | gateway, all other services |
| `KnowledgeReadPort` | `knowledge-read` | gateway |
| `KnowledgeWritePort` | `knowledge-write` | gateway, candidate-ingestion (publish), governance-review (decisions) |
| `CandidateIngestionPort` | `candidate-ingestion` | gateway |
| `GovernanceReviewPort` | `governance-review` | gateway |
| `JobRuntimePort` | `job-runtime` | gateway (status), all services (dispatch) |

### Communication modes by service pair

#### Synchronous (query/decision)

- `gateway` -> `identity-access` (auth check on every request)
- `gateway` -> `knowledge-read` (retrieval queries)
- `gateway` -> `knowledge-write` (lifecycle commands)
- `gateway` -> `candidate-ingestion` (candidate submission)
- `gateway` -> `governance-review` (review queue queries)
- `governance-review` -> `knowledge-write` (review decisions)
- `candidate-ingestion` -> `knowledge-write` (publish resolved candidate)
- `governance-review` -> `knowledge-write` (maintenance / decay aggregate mutation)

**Light-host mode**: in-process direct call through port interfaces.

**Heavy-host mode**: internal HTTP/JSON adapter (Phase 1). RPC evaluation deferred until call frequency and type stability justify it.

#### Asynchronous (event/queue)

- `knowledge-write` -> outbox -> `job-runtime` -> `knowledge-read` (projection refresh, cache invalidation)
- `knowledge-write` -> outbox -> `job-runtime` -> `governance-review` (lifecycle side effects)
- `candidate-ingestion` -> queue -> `job-runtime` (candidate processing pipeline)
- `governance-review` -> outbox -> `job-runtime` (remediation follow-up)
- `job-runtime` -> any service (shared job execution)

**Transport**: PostgreSQL-backed task_queue + domain_event_outbox (Phase 1). RabbitMQ optional for `distributed` profile.

### Communication rules

1. **No direct service-to-service database writes.** Service A must never write to Service B's authoritative tables. All cross-service state changes go through ports.
2. **No local fallback writes across the candidate/review -> knowledge boundary.** If a remote `KnowledgeWritePort` call fails with `404`, `409`, `403`, `503`, or `timeout`, the caller must surface the failure semantics instead of silently mutating knowledge tables locally.
3. **No circular synchronous calls.** If Service A calls Service B synchronously, Service B must not call Service A synchronously. Use async event propagation for the reverse direction.
4. **Sync calls are bounded.** Every synchronous internal call must have a timeout and a failure strategy (fail-fast, fallback, retry with backoff).
5. **Async events are ordered per aggregate.** Outbox events for the same aggregate (e.g., same knowledge entry ID) must be delivered in order.

## Ownership Model

### Authoritative ownership

Each service has exclusive write authority over its tables. This is the primary service boundary definition.

| Domain | Owner | Boundary rule |
|---|---|---|
| Auth / session / access-key | `identity-access` | Only `identity-access` writes auth state |
| User / team / membership | `identity-access` | Only `identity-access` writes identity state |
| Knowledge / trap / skill | `knowledge-write` | Only `knowledge-write` writes knowledge domain state |
| Lifecycle / decay / maintenance | `knowledge-write` | Only `knowledge-write` writes lifecycle state |
| Candidate / duplicate / lineage | `candidate-ingestion` | Only `candidate-ingestion` writes candidate pipeline state |
| Review queue / remediation | `governance-review` | Only `governance-review` writes governance state |
| Task queue / workflow / outbox | `job-runtime` | Only `job-runtime` writes runtime infrastructure state |
| Projections / search indexes | `knowledge-read` | `knowledge-read` writes derived state only |

### Projection ownership

| Projection | Writer | Source of truth | Invalidation trigger |
|---|---|---|---|
| Retrieval read model | `knowledge-read` | `knowledge-write` authoritative tables | Lifecycle transition events |
| Search indexes | `knowledge-read` | `knowledge-write` authoritative tables | Entry creation/update/deactivation events |
| Query traces | `knowledge-read` | Retrieval queries | Self-generated |
| Permission cache | `identity-access` | User/team/membership tables | Membership/role change events |

### Fault domain isolation

| Service | Failure impact | Degradation strategy |
|---|---|---|
| `gateway` | All external traffic affected | No fallback; gateway is the single entry point |
| `identity-access` | Auth fails for all services | Fail-closed: deny access on timeout |
| `knowledge-read` | Retrieval unavailable | Gateway returns 503 for retrieval endpoints; write path unaffected |
| `knowledge-write` | Write commands fail | Gateway returns 503 for write endpoints; retrieval continues with stale data |
| `candidate-ingestion` | New candidates cannot be submitted | Existing knowledge unaffected; candidates queue in backlog |
| `governance-review` | Review workflows stall | Existing approved knowledge unaffected; pending reviews delayed |
| `job-runtime` | Async processing halts | Authoritative writes still succeed (they commit locally); projections fall behind |

## Phase 1 Physical Process Mapping

During Phase 1, logical services may be combined into fewer physical processes:

### light-host (local-agent / team-monolith)

All seven logical services run in a single process. Port calls are in-process direct calls. This is the current `packages/server` behavior, formalized.

### heavy-host (distributed) -- initial topology

| Physical host | Logical services |
|---|---|
| `gateway-host` | `gateway` |
| `core-api-host` | `identity-access` + `knowledge-write` |
| `read-host` | `knowledge-read` |
| `worker-host` | `candidate-ingestion` + `governance-review` + `job-runtime` |

This 4-process topology is the initial Phase 1 target for `distributed`. It provides read-write isolation and worker separation without requiring 7 independent processes.

Note: Co-locating identity-access and knowledge-write means a knowledge-write crash will also take down auth for all services. This trade-off is acceptable in Phase 1 for operational simplicity; in Phase 2, evaluate splitting identity-access into its own process if auth availability becomes critical.

### Future physical separation

As load patterns, fault domain requirements, and operational maturity evolve, the following services are candidates for independent physical processes:

1. `identity-access` (high-frequency auth checks, benefits from independent scaling)
2. `knowledge-read` (read-heavy, benefits from independent cache and connection pool)
3. `candidate-ingestion` (bursty load, different scaling profile from write path)
4. `governance-review` (human workflow, different availability requirements)

## Rules of Engagement

1. A service must not import code from another `service-*` package directly. This can be verified in CI by checking that no `service-*` package appears in another `service-*` package's `dependencies` in `package.json`. All cross-service interaction goes through `backend-core` ports.
2. A host package must not embed business logic. It only wires ports to implementations and starts processes.
3. A service's repository layer must only write to its owned tables. Reads of other services' tables must go through ports (with Phase 1 temporary exceptions documented).
4. New domain tables must be assigned to exactly one owning service before the table is created.
5. Cross-service events must be routed through the outbox pattern, not direct function calls across service boundaries (for async flows).
6. The `gateway` API surface is the contract with external clients. Internal service boundaries are implementation details that must not leak to the API surface.

## References

- [Target Architecture](TARGET_ARCHITECTURE.md) -- package roles, deployment roles, architecture principles
- [Database Ownership](DATABASE_OWNERSHIP.md) -- table-level ownership and transaction rules
- [Runtime Recomposition Plan 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) -- plan origin, service role definitions
- [Runtime Recomposition Plan 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) -- heavy microservice assembly, internal ports, communication strategy
