# TrapMap Host-Distributed

Distributed deployment assembly for TrapMap. Each bounded-context module runs as an independent service.

## Architecture

```
┌─────────────┐
│   Gateway    │  ← External API surface
│  (port 3000) │
└──────┬───────┘
       │ HTTP
       ├─────────────────────────────────────────────────────────┐
       │                                                         │
       ▼                                                         ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Identity-Access  │  │ Knowledge-Read   │  │ Knowledge-Write  │
│   (port 3001)    │  │   (port 3002)    │  │   (port 3003)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Candidate-       │  │ Governance-      │  │ Job-Runtime      │
│ Ingestion        │  │ Review           │  │                  │
│   (port 3004)    │  │   (port 3005)    │  │   (port 3006)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Services

| Service | Port | Owns |
|---------|------|------|
| gateway | 3000 | External API, request routing |
| identity-access | 3001 | Auth, sessions, permissions, membership |
| knowledge-read | 3002 | Retrieval queries, read-model access |
| knowledge-write | 3003 | Knowledge/trap lifecycle commands |
| candidate-ingestion | 3004 | Candidate intake, dedup, processing |
| governance-review | 3005 | Review workflows, feedback queues |
| job-runtime | 3006 | Task queue, workflow runs, outbox |

## Quick Start

### Start all services

```bash
# Requires PostgreSQL with DATABASE_URL set
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
pnpm dev  # Watch mode for all services
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection URL |
| `TRAPMAP_SERVICE_DATABASE_URL` | - | Per-service database URL (overrides DATABASE_URL) |
| `TRAPMAP_SERVICE_NAME` | - | Service name (when running single service) |
| `TRAPMAP_SERVICE_PORT` | - | Service port (overrides default) |
| `TRAPMAP_LOG_LEVEL` | `info` | Log level |
| `TRAPMAP_GATEWAY_URL` | `http://localhost:3000` | Gateway internal URL |
| `TRAPMAP_IDENTITY_ACCESS_URL` | `http://localhost:3001` | Identity-access internal URL |
| `TRAPMAP_KNOWLEDGE_READ_URL` | `http://localhost:3002` | Knowledge-read internal URL |
| `TRAPMAP_KNOWLEDGE_WRITE_URL` | `http://localhost:3003` | Knowledge-write internal URL |
| `TRAPMAP_CANDIDATE_INGESTION_URL` | `http://localhost:3004` | Candidate-ingestion internal URL |
| `TRAPMAP_GOVERNANCE_REVIEW_URL` | `http://localhost:3005` | Governance-review internal URL |
| `TRAPMAP_JOB_RUNTIME_URL` | `http://localhost:3006` | Job-runtime internal URL |

## Design Principles

1. **Service isolation**: Each service runs independently with its own database connection pool
2. **Gateway-only external access**: Only the gateway exposes public API endpoints
3. **HTTP-based inter-service communication**: Services communicate via internal HTTP endpoints
4. **Backend-core reuse**: All services use `@trapmap/backend-core` modules
5. **Database ownership**: Each service owns its database schema
