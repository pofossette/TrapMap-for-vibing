# Target Architecture (Runtime Recomposition)

> Frozen by Task 00 of the runtime recomposition plan. All subsequent plans, package work, and deployment scripts must reference this document as the authoritative source for terminology, package roles, deployment roles, service roles, and architecture boundaries.

## Status

- Phase: 1 (shared database, explicit ownership)
- Authoritative source for terminology frozen in this document

## Current State (Baseline)

TrapMap is a `pnpm` + TypeScript monorepo with three runtime packages:

| Package | Role today |
|---|---|
| `packages/cli` | Commander.js CLI client, HTTP calls, output rendering, local config |
| `packages/server` | Fastify API server, all business logic, persistence, worker bootstrap |
| `packages/contracts` | Shared Zod schemas and TypeScript types |

The server already has `deployment profile` (`local-agent`, `team-monolith`, `distributed`), `runtimeMode`, `serviceUnit`, and `task transport` concepts implemented. However, the single `packages/server` package still holds gateway routing, application services, repository implementations, worker bootstrap, and host wiring in a single tree.

## Target Package Roles

### client-core

**Package**: `packages/client-core`

Client-shared access layer. Provides:

- HTTP gateway SDK (typed request/response helpers against the gateway API)
- Session handling (token management, refresh, auth header injection)
- Error model (normalized HTTP error types, retry policy, rate-limit awareness)
- Request helpers (pagination, streaming, content-type negotiation)

Does NOT provide: CLI argument parsing, output rendering, command orchestration, or any UI-specific behavior. Those remain in `packages/cli` (or a future web client package).

Consumers: `packages/cli`, future web client, any external integration that calls the gateway.

### backend-core

**Package**: `packages/backend-core`

Backend core kernel. Provides:

- Application services (use-case orchestration, domain command handling)
- Ports (typed interfaces for repositories, external adapters, internal cross-context calls)
- Host-agnostic runtime capability model (`deploymentProfile`, `runtimeMode`, `serviceUnit`, `routeSurface`, `asyncOwnershipExpectation`, `storagePosture`, `authTeamExpectation`)
- Bounded-context orchestration (lifecycle state machine, outbox emit, queue dispatch contracts)
- Domain types (entities, value objects, events that are NOT request/response schemas -- those stay in `contracts`)

Does NOT provide: HTTP route registration, Fastify plugin wiring, worker thread bootstrap, repository implementations, or database connection management. Those belong in host packages.

Consumers: every host package, every service package.

### host

A host package assembles `backend-core` into an executable process -- HTTP server, task worker, or outbox worker. A host is responsible for:

- Wiring concrete repository implementations to backend-core ports
- Registering HTTP routes (for API hosts)
- Registering task/queue handlers (for worker hosts)
- Loading configuration and environment
- Starting the process (port binding, graceful shutdown, health endpoints)

Two host packages exist:

| Package | Deployment target |
|---|---|
| `packages/host-local` | `local-agent`, `team-monolith` -- single machine, minimal dependencies, low ops burden |
| `packages/host-distributed` | `distributed` -- multiple service units, independent scaling, read-write isolation |

During migration, `packages/server` continues to serve as the transition shell. It will be progressively thinned until `host-local` and `host-distributed` fully replace it.

## Deployment Roles

### light-host

Single-machine, local, or single-instance deployment. Characteristics:

- Minimal external dependencies (no message broker required)
- Low ops burden (single process or few processes on one machine)
- Multiple logical services inlined into one process where practical
- Suitable for: `local-agent` (single user, single dev machine), `team-monolith` (small team, single Docker container)

Assembled by: `packages/host-local`

### heavy-host

Distributed deployment. Characteristics:

- Independent scaling per service unit
- Read-write isolation between retrieval and write paths
- Explicit service boundaries with defined internal communication contracts
- External message broker optional but supported (task transport: PostgreSQL or RabbitMQ)
- Suitable for: `distributed` (multi-team, production, separate worker processes)

Assembled by: `packages/host-distributed`

**Mapping to deployment profiles**:

| Profile | Host role | Notes |
|---|---|---|
| `local-agent` | light-host | Single process, in-memory or local PG |
| `team-monolith` | light-host | Single Docker container, shared PG |
| `distributed` | heavy-host | Multiple processes, optional MQ, shared PG (Phase 1) |

## Service Roles

Each service represents a bounded context with a clear authoritative ownership boundary. Services are logical units; they may share a process in light-host mode or run as separate processes in heavy-host mode.

### gateway

- **External entry point**: the only service exposed to CLI, web clients, and external integrations
- **Responsibilities**: request routing, aggregation, rate limiting, external auth boundary enforcement, stable API surface
- **Does NOT own**: any authoritative business tables, any business state machine logic
- **Delegates to**: backend-core application services via internal ports

### identity-access

- **Owns**: auth decisions, session lifecycle, access-key management, team CRUD, membership CRUD, RBAC decision computation
- **Authoritative tables**: auth, session, access-key, membership, team tables
- **Provides to other services**: permission decisions, actor lookups, team resolution
- **Consumers**: gateway (auth middleware), all other services (authorization checks)

### knowledge-read

- **Owns**: retrieval query execution, query tracing, read-only projections, status read model, read-side caches
- **Authoritative tables**: read-only projection tables, cache tables, search index tables, query trace read-side tables
- **Does NOT own**: any authoritative write path for knowledge, trap, skill, lifecycle, maintenance, or decay
- **Projection responsibility**: rebuilds read-side state from events emitted by `knowledge-write`

### knowledge-write

- **Owns**: knowledge entry CRUD, trap lifecycle, skill artifact lifecycle, maintenance assignment, decay management, lifecycle state transitions, evidence updates
- **Authoritative tables**: knowledge, trap, skill lifecycle, maintenance, decay tables
- **Emits**: lifecycle transition events, invalidation events, projection refresh triggers
- **Does NOT own**: retrieval read model, search index writes (those are projections owned by `knowledge-read`)

### candidate-ingestion

- **Owns**: candidate intake, normalization, dedup preprocessing, candidate status advancement, duplicate case creation, resolution outcome recording
- **Authoritative tables**: candidate intake, processing status, dedup analysis intermediate state tables
- **Does NOT own**: knowledge authoritative tables (publishes results; `knowledge-write` consumes)
- **Load profile**: bursty, async-heavy, suitable for independent scaling

### governance-review

- **Owns**: human-in-the-loop queues, review workbench state, conflict resolution state, remediation queue state
- **Authoritative tables**: human intervention queues, review workbench state, conflict resolution state, remediation queue state tables
- **Does NOT own**: knowledge lifecycle truth tables (decisions flow through `knowledge-write` via command ports)

### job-runtime

- **Owns**: task queue, workflow runs, outbox dispatch runtime, lease/reclaim metadata
- **Authoritative tables**: task queue, workflow runs, outbox dispatch runtime, lease/reclaim metadata tables
- **Does NOT own**: any business domain truth tables
- **Role**: executes async work dispatched by other services; manages task lifecycle, retries, dead-letter handling. Also owns the domain event outbox for dispatching cross-service events.

## Target Package Layout

```
Trap-Map/
├── packages/
│   ├── client-core/               # Client-shared HTTP gateway SDK
│   ├── backend-core/              # Backend core kernel (services, ports, capability model)
│   ├── service-gateway/           # Gateway host/transport/assembly
│   ├── service-identity-access/   # Auth, session, access-keys, membership, team, RBAC
│   ├── service-knowledge-read/    # Retrieval, read-only projections, query trace, read cache
│   ├── service-knowledge-write/   # Knowledge/trap/skill/lifecycle/maintenance/decay writes
│   ├── service-candidate-ingestion/ # Candidate intake, normalization, dedup, status
│   ├── service-governance-review/ # Review queues, workbench, conflict resolution, remediation
│   ├── service-job-runtime/       # Task queue, workflow runs, outbox dispatch, shared jobs
│   ├── host-local/                # Light host assembly (local-agent, team-monolith)
│   ├── host-distributed/          # Heavy host assembly (distributed services)
│   ├── cli/                       # CLI (simplified; no longer holds shared HTTP SDK)
│   ├── server/                    # Transition shell; being replaced by host-local/host-distributed
│   ├── contracts/                 # Shared Zod schemas and TypeScript types
│   └── skills/                    # Project-level Skill workflows
├── evals/                         # Retrieval and summary evaluation
├── docs/                          # Project documentation
├── scripts/                       # Automation and deploy scripts
└── docker-compose.yml
```

### Package dependency direction

```
contracts ──────────────────────────────────────────────────┐
    │                                                       │
    ▼                                                       │
client-core ← cli, future web client                        │
    │                                                       │
backend-core ← service-* ← host-local, host-distributed     │
    │                           │                           │
    └───────────────────────────┴───────────────────────────┘
                                ↑
                           server (transition shell, shrinking)
```

Key constraints:

1. `client-core` depends on `contracts` only. Never depends on `backend-core` or any server-side package.
2. `backend-core` depends on `contracts`. Does NOT depend on any service or host package.
3. Each `service-*` depends on `backend-core` and `contracts`. Service packages are peers; they do NOT depend on each other directly. Cross-service interaction goes through internal ports defined in `backend-core`.
4. `host-local` and `host-distributed` depend on `backend-core`, `contracts`, and the service packages they assemble. They wire concrete implementations to ports.
5. `packages/cli` depends on `client-core` and `contracts`. Does NOT depend on `backend-core` or any server-side package.
6. `packages/server` (transition shell) depends on `backend-core`, `contracts`, and service packages during migration. Eventually replaced.

## Architecture Principles

1. **All clients program against gateway SDK / gateway API only.** CLI, web client, external integrations all connect through a single gateway URL. No client ever connects to internal service endpoints directly.

2. **All hosts program against backend-core, not business logic.** Host packages wire ports, configure adapters, and start processes. They do not copy, re-implement, or bypass application services.

3. **Microservice boundaries are based on authoritative ownership, read-write path, and fault domain first.** Physical process count is a secondary consideration. A service boundary is valid even if two services share a process in light-host mode.

4. **Phase 1 keeps shared PostgreSQL but does not use it as an excuse to skip service boundary definition.** Table-level ownership is frozen. Authoritative writes are enforced at the module boundary. Cross-service consistency uses outbox + queue + projection, not distributed transactions.

5. **No distributed transactions in Phase 1.** Cross-service writes are atomic only within a single service's local PostgreSQL transaction (authoritative write + local outbox write). Cross-service flows use asynchronous eventual consistency.

6. **No RPC-first architecture.** Internal communication starts with port-first, transport-agnostic interfaces defined in `backend-core`. Light-host uses in-process calls. Heavy-host starts with internal HTTP/JSON adapters. RPC is adopted only when call frequency, type stability, and latency pressure justify it.

7. **Read-side state is derived, not authoritative.** `knowledge-read` projections, caches, and search indexes are derived from events emitted by `knowledge-write`. The write side is responsible for invalidation triggers; the read side is responsible for consuming them.

8. **Gateway does not hold business logic.** It delegates to backend-core application services via ports. Gateway is responsible for API surface stability, request aggregation, rate limiting, and auth boundary enforcement -- nothing more.

## Non-Goals

These are explicitly out of scope for the current recomposition:

- Frontend web application or component implementation
- Splitting individual services further into fine-grained technical-layer services (e.g., separate `role-service`, `permission-service`, `queue-service`)
- Independent database per bounded context in Phase 1
- Cross-database distributed transactions or two-phase commit
- RPC framework selection or adoption (deferred to Phase 2+)

## References

- [Runtime Recomposition Plan 00](../plans/runtime-recomposition/00-baseline-and-target-architecture.md) -- plan origin
- [Runtime Recomposition Plan 01](../plans/runtime-recomposition/01-shared-client-core-extraction.md) -- client-core extraction
- [Runtime Recomposition Plan 02](../plans/runtime-recomposition/02-backend-core-kernel-extraction.md) -- backend-core extraction
- [Runtime Recomposition Plan 03](../plans/runtime-recomposition/03-light-host-assembly.md) -- light host assembly
- [Runtime Recomposition Plan 04](../plans/runtime-recomposition/04-heavy-microservice-assembly.md) -- heavy microservice assembly
- [Runtime Recomposition Plan 05](../plans/runtime-recomposition/05-migration-validation-and-doc-rollout.md) -- migration and validation
- [Database Ownership](DATABASE_OWNERSHIP.md) -- table-level ownership and transaction rules
- [Service Boundaries](SERVICE_BOUNDARIES.md) -- service role definitions and ownership model
