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
| `TRAPMAP_GATEWAY_URL` | `http://127.0.0.1:4000` | Gateway internal URL |
| `TRAPMAP_IDENTITY_ACCESS_URL` | `http://127.0.0.1:4001` | Identity-access internal URL |
| `TRAPMAP_KNOWLEDGE_READ_URL` | `http://127.0.0.1:4002` | Knowledge-read internal URL |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | `http://127.0.0.1:4003` | Knowledge-write internal URL |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | `http://127.0.0.1:4004` | Candidate-ingestion internal URL |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | `http://127.0.0.1:4005` | Review service internal URL (deploy dir remains `governance-review`) |
| `TRAPMAP_JOB_RUNTIME_URL` | `http://127.0.0.1:4006` | Job-runtime internal URL |

## Design Principles

1. **Service isolation**: Each service runs independently with its own database connection pool
2. **Gateway-only external access**: Only the gateway exposes public API endpoints
3. **HTTP-based inter-service communication**: Services communicate via internal HTTP endpoints
4. **Backend-core reuse**: All services use `@trapmap/backend-core` modules
5. **Ownership by business truth**: `review` decides, `knowledge-write` applies final knowledge writes, `candidate-ingestion` publishes through `knowledge-write`, and `job-runtime` only owns transport/runtime orchestration

## Readiness Notes

- `test:acceptance` now includes both real internal HTTP hop coverage and a multi-process runtime closeout for gateway -> candidate-ingestion -> knowledge-write, gateway -> governance-review -> knowledge-write, and gateway -> job-runtime.
- `knowledge-read` now exposes an explicit projection/freshness contract at `/internal/knowledge-read/projection-status`.
- `packages/host-distributed` is now only the thin process host for `knowledge-read`; the authoritative read-service assembly and route contract live in `packages/service-knowledge-read`.
- The current `knowledge-read` backing model still uses the shared authoritative PostgreSQL posture via a named projection adapter. This is sufficient for boundary clarity, not yet for independent derived-store isolation.
- Physical microservice split is no longer blocked on missing multi-process write-path proof; it is still blocked on `eval:smoke` closeout and read-side Phase 2 maturity, not on route ownership declarations alone.
