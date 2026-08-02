
# @trapmap/host-distributed

TrapMap's distributed host assembly layer. Responsible for process startup, runtime wiring, and internal HTTP transport for the gateway and six bounded-context services. Each service can run as an independent process.

## Architecture

```
                       External Clients
                            |
                            v
                  ┌─────────────────┐
                  │     Gateway      │  Only externally-exposed service
                  │    (port 4000)   │  Auth, routing, request/trace propagation
                  └────────┬────────┘
                           │ HTTP (internal)
            ┌──────────────┼──────────────────────────────┐
            │              │              │                │
            v              v              v                v
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Identity-   │ │  Knowledge-  │ │  Knowledge-  │ │  Candidate-  │
    │  Access      │ │  Read        │ │  Write       │ │  Ingestion   │
    │  (4001)      │ │  (4002)      │ │  (4003)      │ │  (4004)      │
    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

    ┌──────────────┐ ┌──────────────┐
    │  Governance-  │ │  Job-Runtime  │
    │  Review       │ │  (4006)       │
    │  (4005)       │ │               │
    └──────────────┘ └──────────────┘
```

## Services

| Service | Port | Responsibility |
|---------|------|----------------|
| gateway | 4000 | External API, authentication, request routing, Prometheus metrics |
| identity-access | 4001 | Authentication, sessions, permissions, team/member management |
| knowledge-read | 4002 | Retrieval queries, read-model access, projection status |
| knowledge-write | 4003 | Knowledge/trap lifecycle commands, artifact operations |
| candidate-ingestion | 4004 | Candidate intake, deduplication, resolution, publishing |
| governance-review | 4005 | Review workflows, feedback queues, governance commands |
| job-runtime | 4006 | Task queue, outbox, workflow execution |

## Quick Start

### Prerequisites

- PostgreSQL (set `DATABASE_URL` or `TRAPMAP_DATABASE_URL`)
- Node.js 20+

### Start all services

```bash
# Run database migrations first
pnpm --filter @trapmap/host-distributed exec tsx src/migrate.ts

# Start all 7 services in a single process
pnpm start
```

### Start a single service

```bash
pnpm start:gateway
pnpm start:identity-access
pnpm start:knowledge-read
pnpm start:knowledge-write
pnpm start:candidate-ingestion
pnpm start:governance-review
pnpm start:job-runtime
```

### Development mode (watch + auto-restart)

```bash
pnpm dev                    # All services
pnpm dev:gateway            # Single service
pnpm dev:candidate-ingestion
```

## Public API Surface (Gateway)

The gateway exposes a REST API under `/v1/`. All non-public endpoints require a `Bearer` session token in the `Authorization` header.

### Public (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/live` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |
| POST | `/v1/auth/login` | Authenticate (handle+password or systemAdminKey) |
| POST | `/v1/auth/register` | Register new user |

### Auth (`/v1/auth/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/login` | Login, returns session token |
| POST | `/v1/auth/logout` | Invalidate session |

### Teams & Members (`/v1/teams/`, `/v1/members/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/teams` | Create team |
| GET | `/v1/teams` | List teams for user |
| POST | `/v1/teams/select` | Select active team |
| POST | `/v1/members` | Add team member |
| PUT | `/v1/members/:memberId` | Update member |
| POST | `/v1/access-keys` | Provision access key |

### Knowledge (`/v1/knowledge/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/knowledge/mine` | List current user's entries |
| GET | `/v1/knowledge/:entryId` | Get entry by ID |
| POST | `/v1/knowledge` | Submit new entry |
| PUT | `/v1/knowledge/:entryId` | Update entry |
| POST | `/v1/knowledge/:entryId/resubmit` | Resubmit entry for review |
| POST | `/v1/knowledge/:entryId/supersede` | Replace entry with another |
| GET | `/v1/knowledge/projection-status` | Read-model projection status |

### Traps (`/v1/traps/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/traps` | Create trap |
| GET | `/v1/traps` | List traps by team |
| GET | `/v1/traps/:trapId` | Get trap by ID |

### Retrieval (`/v1/retrieval/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/retrieval/search` | Search knowledge entries |
| POST | `/v3/retrieval/search` | Search (v3 alias) |

### Candidates (`/v1/candidates/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/candidates` | Submit candidate |
| GET | `/v1/candidates` | List candidates by status |
| GET | `/v1/candidates/:candidateId` | Get candidate by ID |
| POST | `/v1/candidates/:candidateId/resolution` | Apply resolution |
| POST | `/v1/candidates/:candidateId/manual-result` | Submit manual result |

### Governance (`/v1/knowledge/review`, `/v1/feedback`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/knowledge/review` | Approve or reject entry |
| POST | `/v1/knowledge/maintenance` | Apply maintenance decision |
| POST | `/v1/knowledge/decay` | Apply decay decision |
| POST | `/v1/feedback` | Submit feedback |
| POST | `/v1/artifacts/review` | Approve or reject artifact |

### Artifacts (`/v1/operations/artifacts/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/operations/artifacts/import` | Import artifact bundles |
| POST | `/v1/operations/artifacts/export` | Export artifacts |
| POST | `/v1/operations/artifacts/activate` | Activate artifact paths |
| GET | `/v1/operations/artifacts/review-queue` | List artifact review queue |
| POST | `/v1/operations/artifacts/:artifactId/edit` | Edit artifact |
| GET | `/v1/operations/artifacts/:artifactId/history` | Artifact revision history |
| POST | `/v1/operations/artifacts/:artifactId/review` | Review artifact |
| POST | `/v1/operations/artifacts/:artifactId/deactivate` | Deactivate artifact |

### Feedback Admin (`/v1/operations/feedback/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/operations/feedback` | List feedback entries |
| POST | `/v1/operations/feedback/batch` | Batch feedback operations |
| GET | `/v1/operations/feedback/stats/:entryId` | Feedback stats for entry |
| GET | `/v1/operations/feedback/remediation` | List remediation entries |
| GET | `/v1/operations/feedback/remediation/:entryId` | Get remediation detail |
| POST | `/v1/operations/feedback/remediation/:entryId/complete` | Complete remediation |

### Jobs (`/v1/jobs/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/jobs` | Schedule a job |
| GET | `/v1/jobs/:jobId` | Get job status |
| GET | `/v1/jobs/queue` | Queue status snapshot |
| GET | `/v1/operations/status/async` | Async runtime diagnostics |

## Configuration

All configuration is loaded from environment variables. `packages/host-distributed/src/config/service-config.ts` owns the defaults and resolution logic.

### Resolution priority

1. Explicit `TRAPMAP_*` environment variables (highest)
2. `distributed` profile: Docker DNS defaults on a shared Compose network
3. Other profiles / local development: `localhost` defaults

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | -- | PostgreSQL connection URL |
| `TRAPMAP_DATABASE_URL` | -- | Legacy shared PostgreSQL URL (fallback) |
| `TRAPMAP_SERVICE_DATABASE_URL` | -- | Per-service database URL (overrides DATABASE_URL) |
| `TRAPMAP_SERVICE_NAME` | -- | Service name (when running a single service) |
| `TRAPMAP_SERVICE_PORT` | -- | Service port (overrides default) |
| `TRAPMAP_LOG_LEVEL` | `info` | Log level |
| `TRAPMAP_DEPLOYMENT_PROFILE` | -- | Set to `distributed` for Docker DNS defaults |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | -- | System admin authentication key |

### Connection Pool

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAPMAP_SERVICE_POOL_SIZE` | `5` | Shared pool size budget for all distributed services |
| `TRAPMAP_<SERVICE>_POOL_SIZE` | -- | Per-service pool override, e.g. `TRAPMAP_JOB_RUNTIME_POOL_SIZE=12` |
| `TRAPMAP_DATABASE_CONNECTION_BUDGET` | `30` | Maximum total connections across all services |
| `TRAPMAP_SERVICE_IDLE_TIMEOUT_MS` | `30000` | Pool idle timeout |
| `TRAPMAP_SERVICE_CONNECTION_TIMEOUT_MS` | `5000` | Connection acquisition timeout |
| `TRAPMAP_SERVICE_STATEMENT_TIMEOUT_MS` | `30000` | Statement timeout |
| `TRAPMAP_SERVICE_QUERY_TIMEOUT_MS` | `30000` | Query timeout |
| `TRAPMAP_SERVICE_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `30000` | Idle-in-transaction timeout |

### Internal Service URLs

| Variable | Local Default | Distributed Default |
|----------|--------------|-------------------|
| `TRAPMAP_GATEWAY_URL` | `http://localhost:4000` | `http://gateway:4000` |
| `TRAPMAP_IDENTITY_ACCESS_URL` | `http://localhost:4001` | `http://identity-access:4001` |
| `TRAPMAP_KNOWLEDGE_READ_URL` | `http://localhost:4002` | `http://knowledge-read:4002` |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | `http://localhost:4003` | `http://knowledge-write:4003` |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | `http://localhost:4004` | `http://candidate-worker:4004` |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | `http://localhost:4005` | `http://governance-worker:4005` |
| `TRAPMAP_JOB_RUNTIME_URL` | `http://localhost:4006` | `http://outbox-worker:4006` |

### Service Discovery (Consul)

| Variable | Default | Description |
|----------|---------|-------------|
| `CONSUL_ENABLED` | `false` | Enable Consul-based dynamic discovery |
| `CONSUL_HOST` | `localhost` | Consul HTTP API host |
| `CONSUL_PORT` | `8500` | Consul HTTP API port |
| `TRAPMAP_SERVICE_ADVERTISE_HOST` | -- | Hostname advertised to Consul |

### Observability (OpenTelemetry)

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_DISABLED` | `false` | Disable OpenTelemetry bootstrap |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `OTEL_SAMPLE_RATE` | `1` | Trace sampling ratio (0.0-1.0) |

### Transport

| Variable | Default | Description |
|----------|---------|-------------|
| `TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT` | `http` | Set to `rpc` for RPC-style invocations to knowledge-write |

## Library Exports

The package exports subpath modules for use by other packages:

```typescript
// Configuration
import { loadServiceConfig, ALL_SERVICES } from '@trapmap/host-distributed/config';
import type { ServiceName, ServiceConfig, InternalServiceUrls } from '@trapmap/host-distributed/config';

// Gateway internals (for testing/smoke services)
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client';
import { registerGatewayRoutes } from '@trapmap/host-distributed/gateway/routes';
import { DiscoveryResolver } from '@trapmap/host-distributed/gateway/discovery-resolver';
import { ConsulDiscoveryAdapter } from '@trapmap/host-distributed/gateway/consul-discovery-adapter';

// Shared utilities
import { createServiceDatabase } from '@trapmap/host-distributed/shared/database';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports';
import { assertDatabaseWriteOwner, withDatabaseWriteGuard } from '@trapmap/host-distributed/shared/database-ownership';
import { attachRuntimeTelemetry } from '@trapmap/host-distributed/shared/telemetry';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client';
import { createRemoteJobRuntimeClient } from '@trapmap/host-distributed/shared/internal-job-runtime-client';
```

## Shared Modules

### Database (`shared/database.ts`)

Creates per-service PostgreSQL connection pools with health checks, pool saturation metrics, and configurable timeouts. Each service gets its own pool sized by its configuration.

### Ports (`shared/ports.ts`)

PostgreSQL-backed implementations of `backend-core` port interfaces:
- `KnowledgeReadProjectionPort` -- knowledge entry queries
- `RetrievalQueryPort` -- text search
- `TaskQueuePort` -- job enqueue/requeue with status snapshots
- `OutboxPort` -- domain event outbox with claim/complete/fail lifecycle
- `AuditLogPort` -- delegated from identity-access

### Database Ownership (`shared/database-ownership.ts`)

Enforces write-ownership boundaries at runtime. Each table family (identity, knowledge, candidate, governance, job-runtime, etc.) has a designated write-owner service. `withDatabaseWriteGuard()` wraps repositories in a `Proxy` that throws `DatabaseOwnershipError` on mutating calls from non-owner services.

### Internal Clients (`shared/internal-knowledge-write-client.ts`, `shared/internal-job-runtime-client.ts`)

Remote client adapters for cross-service calls. `createRemoteKnowledgeWriteClient()` supports both HTTP and RPC transport modes. `createRemoteJobRuntimeClient()` delegates job scheduling to the job-runtime service.

### Telemetry (`shared/telemetry.ts`)

Attaches OpenTelemetry instrumentation to Fastify servers: request/response span creation, trace-context propagation, and SDK bootstrap with OTLP exporters.

## Design Principles

1. **Service isolation**: Each service runs independently with its own database connection pool.
2. **Gateway-only external access**: Only the gateway exposes public API endpoints; all other services are internal-only.
3. **HTTP-based inter-service communication**: Services communicate via internal HTTP endpoints with trace-context propagation.
4. **Shared backend-core**: All services use `@trapmap/backend-core` port interfaces, wired to PostgreSQL implementations at the host level.
5. **Ownership by business fact**: `governance-review` owns review decisions, `knowledge-write` owns final knowledge mutations, `candidate-ingestion` publishes via `knowledge-write`, `job-runtime` owns transport/orchestration only.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript |
| `pnpm dev` | Watch mode, all services |
| `pnpm dev:gateway` | Watch mode, gateway only |
| `pnpm start` | Run all services |
| `pnpm start:<service>` | Run a single service |
| `pnpm test` | Run unit tests |
| `pnpm test:acceptance` | Run acceptance tests (requires built service packages) |
| `pnpm typecheck` | Type-check without emitting |

## Testing

```bash
# Unit tests
pnpm test

# Acceptance tests (builds dependent service packages first)
pnpm test:acceptance

# Type checking
pnpm typecheck
```

Test files are co-located with source:

- `src/gateway/routes.test.ts` -- gateway route forwarding
- `src/gateway/server.test.ts` -- gateway server factory
- `src/gateway/internal-client.test.ts` -- internal HTTP client
- `src/gateway/distributed-acceptance.test.ts` -- multi-process delegation
- `src/gateway/distributed-runtime-closeout.test.ts` -- runtime closeout
- `src/gateway/consul-discovery-adapter.test.ts` -- Consul adapter
- `src/gateway/discovery-resolver.test.ts` -- discovery resolver
- `src/identity-access/routes.test.ts` -- identity routes
- `src/knowledge-write/composition.test.ts` -- knowledge-write composition
- `src/candidate-ingestion/routes.test.ts` -- candidate routes
- `src/governance-review/routes.test.ts` -- governance routes
- `src/governance-review/conflict-read.test.ts` -- conflict detection
- `src/governance-review/delegation-acceptance.test.ts` -- delegation flow
- `src/governance-review/ports.test.ts` -- governance ports
- `src/job-runtime/handlers.test.ts` -- job handlers
- `src/job-runtime/ownership-acceptance.test.ts` -- job ownership
- `src/shared/database.test.ts` -- database pool
- `src/shared/database-ownership.test.ts` -- write guards
- `src/shared/observability.test.ts` -- metrics route
- `src/shared/internal-knowledge-write-client.test.ts` -- remote client
- `src/shared/internal-job-runtime-client.test.ts` -- remote client
- `src/index.test.ts` -- main entry
- `src/migrate.test.ts` -- migration runner
- `src/dockerfile.test.ts` -- Dockerfile validation

## Dependencies

### Workspace

- `@trapmap/backend-core` -- port interfaces, domain logic
- `@trapmap/client-core` -- client utilities
- `@trapmap/contracts` -- shared type contracts
- `@trapmap/service-identity-access` -- identity service module
- `@trapmap/service-candidate-ingestion` -- candidate service module
- `@trapmap/service-governance-review` -- governance service module
- `@trapmap/service-job-runtime` -- job runtime module
- `@trapmap/service-knowledge-read` -- knowledge read module
- `@trapmap/service-knowledge-write` -- knowledge write module

### External

- `fastify` -- HTTP server framework
- `pg` -- PostgreSQL client
- `zod` -- schema validation
- `@opentelemetry/*` -- tracing and metrics instrumentation

## Phase Notes

- `knowledge-write` and `governance-review` are the first mature service pair in this host, serving as a reference template for subsequent services.
- The gateway does NOT have its own database; it delegates all operations to internal services.
- Consul discovery is optional and fail-open: if Consul is unavailable, static URLs are used.
- Shared PostgreSQL instance is a transitional arrangement; table-level write ownership is enforced via `database-ownership.ts`.
- `test:acceptance` covers real internal HTTP hops: gateway -> candidate-ingestion -> knowledge-write, gateway -> governance-review -> knowledge-write, and gateway -> job-runtime.
