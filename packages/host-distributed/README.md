# TrapMap Host-Distributed

Distributed deployment assembly for TrapMap. Each bounded-context module runs as an independent service.

## Architecture

```
┌─────────────┐
│   Gateway    │  ← External API surface
│  (port 4000) │
└──────┬───────┘
       │ HTTP
       ├─────────────────────────────────────────────────────────┐
       │                                                         │
       ▼                                                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Identity-Access  │  │ Knowledge-Read   │  │ Knowledge-Write  │
│   (port 4001)    │  │   (port 4002)    │  │   (port 4003)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Candidate-       │  │ Review           │  │ Job-Runtime      │
│ Ingestion        │  │ (deploy dir:     │  │                  │
│   (port 4004)    │  │ governance-review)│ │   (port 4006)    │
│                  │  │   (port 4005)    │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Services

| Service | Port | Owns |
|---------|------|------|
| gateway | 4000 | External API, request routing |
| identity-access | 4001 | Auth, sessions, permissions, membership |
| knowledge-read | 4002 | Retrieval queries, read-model access |
| knowledge-write | 4003 | Knowledge/trap lifecycle commands |
| candidate-ingestion | 4004 | Candidate intake, dedup, processing |
| governance-review | 4005 | `review` service deploy dir; review workflows, feedback queues, governance commands |
| job-runtime | 4006 | Task queue, workflow runs, outbox |

## Quick Start

### Start all services

```bash
# Requires PostgreSQL with DATABASE_URL or TRAPMAP_DATABASE_URL set
pnpm start
```

### Start individual services

```bash
pnpm start:gateway
pnpm start:identity-access
pnpm start:knowledge-read
# ... etc
```

### Development

```bash
pnpm dev
pnpm dev:gateway
pnpm dev:candidate-ingestion
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection URL |
| `TRAPMAP_DATABASE_URL` | - | Legacy-compatible shared PostgreSQL URL |
| `TRAPMAP_SERVICE_DATABASE_URL` | - | Per-service database URL (overrides DATABASE_URL) |
| `TRAPMAP_SERVICE_NAME` | - | Service name (when running single service) |
| `TRAPMAP_SERVICE_PORT` | - | Service port (overrides default) |
| `TRAPMAP_LOG_LEVEL` | `info` | Log level |
| `TRAPMAP_SERVICE_POOL_SIZE` | `5` | Shared PostgreSQL pool budget for distributed services |
| `TRAPMAP_<SERVICE>_POOL_SIZE` | unset | Per-service pool budget override, e.g. `TRAPMAP_JOB_RUNTIME_POOL_SIZE=12` |
| `TRAPMAP_GATEWAY_URL` | `http://localhost:4000` locally, `http://gateway:4000` in `distributed` | Gateway internal URL |
| `TRAPMAP_IDENTITY_ACCESS_URL` | `http://localhost:4001` locally, `http://identity-access:4001` in `distributed` | Identity-access internal URL |
| `TRAPMAP_KNOWLEDGE_READ_URL` | `http://localhost:4002` locally, `http://knowledge-read:4002` in `distributed` | Knowledge-read internal URL |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | `http://localhost:4003` locally, `http://knowledge-write:4003` in `distributed` | Knowledge-write internal URL |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | `http://localhost:4004` locally, `http://candidate-worker:4004` in `distributed` | Candidate-ingestion internal URL |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | `http://localhost:4005` locally, `http://governance-worker:4005` in `distributed` | Review service internal URL (deploy dir remains `governance-review`) |
| `TRAPMAP_JOB_RUNTIME_URL` | `http://localhost:4006` locally, `http://outbox-worker:4006` in `distributed` | Job-runtime internal URL |

`packages/host-distributed/src/config/service-config.ts` is the owner seam for these defaults. It resolves:

- `distributed` profile -> Docker DNS defaults on the shared compose network
- other profiles / local dev -> `localhost` defaults
- explicit `TRAPMAP_*_URL` env -> highest priority override
- distributed DB pool budget by `TRAPMAP_SERVICE_POOL_SIZE`, with per-service override via `TRAPMAP_<SERVICE>_POOL_SIZE`

## Design Principles

1. **Service isolation**: Each service runs independently with its own database connection pool
2. **Gateway-only external access**: Only the gateway exposes public API endpoints
3. **HTTP-based inter-service communication**: Services communicate via internal HTTP endpoints
4. **Backend-core reuse**: All services use `@trapmap/backend-core` modules
5. **Ownership by business truth**: `review` decides, `knowledge-write` applies final knowledge writes, `candidate-ingestion` publishes through `knowledge-write`, and `job-runtime` only owns transport/runtime orchestration

## Readiness Notes

- `test:acceptance` now includes both real internal HTTP hop coverage and a multi-process runtime closeout for gateway -> candidate-ingestion -> knowledge-write, gateway -> governance-review -> knowledge-write, and gateway -> job-runtime.
- `knowledge-read` now exposes an explicit projection/freshness contract at `/internal/knowledge-read/projection-status`, and the gateway forwards it on `/v1/knowledge/projection-status`.
- `packages/host-distributed` is now only the thin process host for `knowledge-read`; the authoritative read-service assembly and route contract live in `packages/service-knowledge-read`.
- The current `knowledge-read` backing model still uses shared authoritative PostgreSQL for the temporary direct-backed entry reads exposed by the projection status contract. Retrieval/search/query-trace surfaces remain derived read-side state. This is sufficient for boundary clarity, not yet for independent derived-store isolation.
- Physical microservice split is no longer blocked on missing multi-process write-path proof; it is still blocked on `eval:smoke` closeout and read-side Phase 2 maturity, not on route ownership declarations alone.

## Phase 3 Maturity Closeout: `knowledge-write + governance-review`

`knowledge-write` and `governance-review` are the first mature service sample in this host. They serve as the reference template for subsequent services.

### Frozen Owner Boundary

- `governance-review` owns governance commands, feedback, and remediation/maintenance/decay workbench flow. It does **not** own final knowledge aggregate mutation.
- `knowledge-write` owns final knowledge aggregate mutation, lifecycle rules, and authoritative write truth. It accepts delegation from `governance-review` and `candidate-ingestion`.
- `gateway` only performs external transport, auth, request/trace propagation, and canonical error mapping.

### Sync / Async Boundary

- **Sync**: governance command receipt, eligibility check, flow interpretation, audit (`governance-review`); final aggregate mutation (`knowledge-write`).
- **Async**: follow-up actions (projection refresh, artifact follow-up, remediation draft, outbox dispatch) enter outbox/queue/workflow and never return to the synchronous path.

### Command / Event Contract

- `governance-review -> knowledge-write`: `approveReviewDecision`, `rejectReviewDecision`, `applyMaintenanceDecision`, `applyDecayDecision`.
- `candidate-ingestion -> knowledge-write`: `publishCandidateResult`.
- Post-mutation events use the canonical event catalog in `packages/contracts/src/domain/async.ts`.

### Failure Semantics

- `403 forbidden` / `404 not-found` / `409 conflict` / `503 unavailable` / `504 timeout` maintain the same meaning across gateway, `governance-review`, and `knowledge-write`.
- `401` remains a gateway/auth transport concern and does not enter inter-owner failure semantics.
- Idempotent retry replays the same command contract; outbox retry replays the same canonical event.

### Health / Readiness / Ownership

- `GET /internal/health` - liveness with owner declaration (both services)
- `GET /internal/readiness` - dependency reachability with operator-facing follow-up disposition (both services)
- `GET /internal/ownership` - full static owner declaration (both services)

### Shared PostgreSQL (Transitional)

Both services continue to share a PostgreSQL instance but with explicit table owner. `governance-review` does not treat knowledge aggregate tables as its default write surface, and `knowledge-write` does not treat review-queue/feedback tables as its write surface.

### Retained Exceptions

- **Named query seam**: `governance-review` may read knowledge summaries only through a documented query seam or read-only projection.
- **Shared instance**: the shared PostgreSQL instance continues; closing condition is documented in [`docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`](../../docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md).

### Verification

- `rtk pnpm test:distributed-acceptance` - multi-process delegation, error taxonomy, request/trace propagation, idempotent retry
- `rtk pnpm test:deployment-smoke` - service startup, health/readiness, ownership endpoints
- `rtk pnpm typecheck`
