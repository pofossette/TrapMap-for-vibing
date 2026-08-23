# @trapmap/host-local

Nest-based light host entry for TrapMap single-machine deployments. This package assembles all bounded-context service modules, infrastructure adapters, and runtime wiring into a single NestJS application backed by Fastify.

> **组装入口**：`packages/host-local` 是库包。可执行组装中心在 `apps/light`（`@trapmap/app-light`）——根脚本 `dev:local-agent` / `dev:team-monolith` / `pnpm build:light` 经 backend target registry（`appPackage: @trapmap/app-light`）指向该组装中心，它消费本包的 `start()` API。本包内的 `pnpm dev` / `pnpm start` 仅用于库级开发调试。

## Purpose

`host-local` is the default and only supported `light` host implementation. It composes the full TrapMap platform -- knowledge management, candidate ingestion, governance review, identity/access, and job runtime -- into a single process suitable for `local-agent` and `team-monolith` deployment profiles.

The `src/nest/**` path is the frozen default mainline.

## Deployment Profiles

| Profile | Route Surface | Worker | Database | Auth |
|---|---|---|---|---|
| `local-agent` | Full gateway + governance | In-process when owning tasks | JSON store acceptable | Single-user full governance |
| `team-monolith` | Full gateway | In-process tasks + outbox | PostgreSQL required | Team authentication |

The runtime mode (`api`, `task-worker`, `outbox-worker`, `combined`) is programmatically inferred from the deployment profile and preset -- it is not read from an environment variable directly.

## Quick Start

### Programmatic (via `start()`)

```typescript
import { start } from '@trapmap/host-local';

const handle = await start({
  host: '0.0.0.0',
  port: 4000,
});

// Graceful shutdown
await handle.close();
```

### CLI Entry

Run directly with `tsx` or `node`:

```bash
# Development
pnpm dev

# Production
pnpm build && pnpm start
```

Both paths register `SIGINT`/`SIGTERM` handlers for graceful shutdown.

### Docker

```bash
docker build -t trapmap-host-local -f apps/light/Dockerfile .
docker run -p 4000:4000 -e TRAPMAP_DATABASE_URL=postgres://... trapmap-host-local
```

The Dockerfile exposes port 4000 and includes a health check hitting `/health`.

## Public API

### Exports

```typescript
interface NestBootstrapOptions {
  host?: string;   // Listen address, default '0.0.0.0'
  port?: number;   // Listen port, default 4000
}

interface NestBootstrapResult {
  app: unknown;               // NestFastifyApplication instance
  close: () => Promise<void>; // Graceful shutdown function
}

function start(options?: NestBootstrapOptions): Promise<NestBootstrapResult>;
```

### HTTP Endpoints

#### Health & Metrics

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Comprehensive health with dependency status |
| GET | `/ready` | Readiness probe (503 if not ready) |
| GET | `/live` | Liveness probe |
| GET | `/metrics` | Prometheus metrics (text format) |

#### Knowledge Read (authenticated)

| Method | Path | Description |
|---|---|---|
| GET | `/v1/knowledge/:entryId` | Get knowledge entry by ID |
| GET | `/v1/knowledge/mine` | List entries for a user (`?userId=&teamId=`) |
| POST | `/v1/retrieval/search` | Search knowledge (`{ query, teamId?, limit? }`) |
| GET | `/v1/knowledge/projection-status` | Get read projection status |

#### Candidate & Governance Review (authenticated)

| Method | Path | Description |
|---|---|---|
| POST | `/v1/candidates/:candidateId/manual-result` | Submit manual candidate result |
| POST | `/v1/candidates/:candidateId/apply-resolution` | Apply candidate resolution |
| GET | `/v1/knowledge/review-queue` | Get governance review queue (`?status=&search=&source=&riskLevel=&sort=&cursor=&limit=`) |
| POST | `/v1/knowledge/review` | Apply review decision (approve/reject) |

All authenticated endpoints require a `Bearer` token in the `Authorization` header.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRAPMAP_DEPLOYMENT_PROFILE` | (inferred at runtime) | `local-agent`, `team-monolith`, or `distributed` |
| `TRAPMAP_DEPLOYMENT_PRESET` | `monolith` | Preset: `monolith`, `api`, `candidate-worker`, `governance-worker`, `outbox-worker` |
| `HOST` | `127.0.0.1` | HTTP listen address |
| `PORT` | `4000` | HTTP listen port |
| `TRAPMAP_DATABASE_URL` | (none) | PostgreSQL connection string (required for `team-monolith`) |
| `TRAPMAP_DATA_FILE` | `.data/skill-shareer.json` | JSON data file path (for `local-agent` without Postgres) |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | (none) | System admin API key |
| `CORS_ORIGINS` | `*` | Comma-separated allowed CORS origins |
| `RATE_LIMIT_MAX_PER_MINUTE` | `0` (unlimited) | Max requests per minute |
| `SESSION_TRANSPORT` | `bearer-header` | `bearer-header` or `cookie` |
| `TRAPMAP_REQUEST_ID_HEADER` | `x-request-id` | Request ID header name |
| `TRAPMAP_TRACE_HEADER_NAME` | `traceparent` | Trace context header name |
| `TRAPMAP_TASK_TRANSPORT` | `postgres` | Async task transport: `postgres` or `rabbitmq` |
| `TRAPMAP_RABBITMQ_URL` | (none) | RabbitMQ URL (required when transport is `rabbitmq`) |
| `CONSUL_ENABLED` | `false` | Enable Consul service discovery |
| `CONSUL_HOST` | `localhost` | Consul host |
| `CONSUL_PORT` | `8500` | Consul port |

### Bounded-Context Modules

The `AppModule` registers these Nest modules, each representing a bounded context:

- **IdentityAccessModule** -- user/team management, sessions, permissions
- **KnowledgeReadModule** -- knowledge entry queries, retrieval search
- **KnowledgeWriteModule** -- knowledge entry mutations, artifact writes
- **CandidateIngestionModule** -- candidate submission and processing
- **GovernanceReviewModule** -- review queues, approve/reject workflows, conflict resolution
- **JobRuntimeModule** -- async task execution (in-process or outbox)

### Infrastructure Modules

- **ConsulModule** -- Consul service discovery with graceful degradation
- **OtelModule** -- OpenTelemetry tracing and metrics export
- **PrometheusModule** -- Prometheus metrics collection (`prom-client`)
- **LokiModule** -- Loki log shipping (`winston-loki`)
- **HealthModule** -- Health/readiness/liveness probes
- **LifecycleModule** -- Lifecycle phase coordination and health check registration

## Architecture

```
host-local (Fastify HTTP, middleware, lifecycle)
  -> Nest bounded-context modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> service-* packages (domain logic per bounded context)
  -> infrastructure (PostgreSQL, Consul, OpenTelemetry, Prometheus, Loki)
```

The host reads the deployment profile from configuration and uses `backend-core`'s `resolveRuntimeDeployment()` to determine which routes to register, which workers to start, and which capabilities to expose. Runtime mode and service unit are resolved programmatically, not read directly from environment variables.

## Dependencies

### Workspace Packages

| Package | Role |
|---|---|
| `@trapmap/backend-core` | Port interfaces, deployment resolution, module factories |
| `@trapmap/contracts` | Zod schemas, shared types (health, review, knowledge) |
| `@trapmap/ai-providers` | AI provider configuration and factory |
| `@trapmap/client-core` | Client-side shared utilities |
| `@trapmap/service-identity-access` | Identity and access domain logic |
| `@trapmap/service-knowledge-read` | Knowledge read domain logic, retrieval |
| `@trapmap/service-knowledge-write` | Knowledge write domain logic |
| `@trapmap/service-candidate-ingestion` | Candidate ingestion domain logic |
| `@trapmap/service-governance-review` | Governance review domain logic |
| `@trapmap/service-job-runtime` | Job/async task runtime |

### Key External Dependencies

- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` -- NestJS framework with Fastify adapter
- `@opentelemetry/*` -- Distributed tracing and metrics
- `consul` -- Service discovery
- `pg` -- PostgreSQL client
- `prom-client` -- Prometheus metrics
- `winston`, `winston-loki` -- Structured logging with Loki shipping
- `zod` -- Runtime schema validation

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start in watch mode with `tsx` |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled output |
| `pnpm test` | Run tests via vitest |
| `pnpm typecheck` | Type-check without emitting |

## Tests

Test files are co-located with source:

- `src/nest/app.test.ts` -- Application bootstrap tests
- `src/nest/main.test.ts` -- Bootstrap function tests
- `src/nest/runtime/exception-filter.test.ts` -- Exception filter tests
- `src/nest/runtime/request-context.test.ts` -- Request context tests
- `src/nest/runtime/backend-core-adapters.test.ts` -- Adapter tests
- `src/nest/runtime/logging.middleware.test.ts` -- Logging middleware tests
- `src/nest/runtime/host-services.test.ts` -- Host services tests
- `src/nest/runtime/governance-composition.test.ts` -- Governance composition tests
- `src/nest/runtime/import-boundary.test.ts` -- Import boundary enforcement tests
- `src/nest/gateway/gateway.schemas.test.ts` -- Gateway schema validation tests
- `src/nest/gateway/candidate-review.controller.test.ts` -- Candidate review controller tests
- `src/nest/config/import-boundary.test.ts` -- Config import boundary tests
- `src/nest/candidate-ingestion/candidate-processing.service.test.ts` -- Candidate processing tests
- `src/nest/governance-review/governance-review.module.test.ts` -- Governance review module tests
- `src/nest/job-runtime/job-runtime-worker.service.test.ts` -- Job runtime worker tests
- `src/nest/service-discovery/consul.service.test.ts` -- Consul service tests
- `src/nest/observability/prometheus.service.test.ts` -- Prometheus service tests
- `src/nest/observability/metrics-port.adapter.test.ts` -- Metrics adapter tests
- `src/nest/observability/observability-chain.test.ts` -- Observability chain tests
- `src/nest/health/health.controller.test.ts` -- Health controller tests
- `src/nest/lifecycle/lifecycle-manager.service.test.ts` -- Lifecycle manager tests
- `src/nest/adapters/adapter-factory.test.ts` -- Adapter factory tests
