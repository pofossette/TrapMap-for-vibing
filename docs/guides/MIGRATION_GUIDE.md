# Runtime Recomposition Migration Guide

## Status

- Status: `active`
- Created: `2026-06-18`
- Purpose: migrate from the legacy `cli + server` shape to `client-core + backend-core + hosts`

## Overview

Runtime recomposition turns TrapMap from a monolithic `CLI + Server` layout into a modular assembly:

```text
packages/
├── client-core/       shared gateway transport layer
├── backend-core/      host-agnostic backend kernel
├── host-local/        light host for local-agent / team-monolith
├── host-distributed/  heavy host for distributed profile
├── cli/               CLI logic only, consumes client-core
├── server/            compatibility shell / legacy implementation surface
├── contracts/         shared types and schemas
└── skills/            skill artifacts
```

## Completion Audit

- Phase 1 `client-core`: done. CLI transport has been extracted and CLI now talks to gateway through `@trapmap/client-core`.
- Phase 2 `backend-core`: done. Runtime capability model, ports, invocation seams, and bounded-context modules exist in `@trapmap/backend-core`.
- Phase 3 `host-local`: done. Root `pnpm dev:local-agent` and `pnpm dev:team-monolith` now target `@trapmap/host-local`.
- Phase 4 `host-distributed`: done. Root distributed dev scripts now target `@trapmap/host-distributed`.
- Phase 5 legacy收口: partial. `packages/server` still exists as a compatibility shell and verification surface, but candidate/review/maintenance/decay authoritative writes have moved to `@trapmap/host-distributed`.

## Current Official Entrypoints

Use these root scripts first:

```bash
pnpm dev:local-agent
pnpm dev:team-monolith
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
pnpm dev:cli
```

Compatibility scripts such as `pnpm dev:server*` still exist, but they are no longer the primary migration target.

## Environment Compatibility

### Gateway

- Default local gateway URL remains `http://127.0.0.1:4000`
- `@trapmap/host-local` now defaults to `PORT=4000`
- `@trapmap/host-distributed` service ports default to `4000-4006`

### Database URL

New hosts accept both:

- `DATABASE_URL`
- `TRAPMAP_DATABASE_URL`

Per-service distributed override remains:

- `TRAPMAP_SERVICE_DATABASE_URL`

This keeps existing `.env` files and most current docs working during migration.

## Host-Local

Minimal local usage:

```bash
TRAPMAP_DEPLOYMENT_PROFILE=local-agent pnpm --filter @trapmap/host-local dev
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith pnpm --filter @trapmap/host-local dev
```

Verification:

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/ready
```

Relevant env:

```bash
TRAPMAP_DEPLOYMENT_PROFILE=local-agent|team-monolith
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
TRAPMAP_DATABASE_URL=postgresql://...
# or DATABASE_URL=postgresql://...
TRAPMAP_DEPLOYMENT_PRESET=monolith
TRAPMAP_SERVICE_UNIT=full-platform
```

## Host-Distributed

Development commands:

```bash
pnpm --filter @trapmap/host-distributed dev:gateway
pnpm --filter @trapmap/host-distributed dev:identity-access
pnpm --filter @trapmap/host-distributed dev:knowledge-read
pnpm --filter @trapmap/host-distributed dev:knowledge-write
pnpm --filter @trapmap/host-distributed dev:candidate-ingestion
pnpm --filter @trapmap/host-distributed dev:governance-review
pnpm --filter @trapmap/host-distributed dev:job-runtime
```

Verification:

```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4001/health
curl http://127.0.0.1:4002/health
curl http://127.0.0.1:4003/health
curl http://127.0.0.1:4004/health
curl http://127.0.0.1:4005/health
curl http://127.0.0.1:4006/health
```

Relevant env:

```bash
TRAPMAP_SERVICE_NAME=gateway|identity-access|knowledge-read|knowledge-write|candidate-ingestion|governance-review|job-runtime
TRAPMAP_SERVICE_PORT=4000
TRAPMAP_SERVICE_DATABASE_URL=postgresql://...
TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000
TRAPMAP_IDENTITY_ACCESS_URL=http://127.0.0.1:4001
TRAPMAP_KNOWLEDGE_READ_URL=http://127.0.0.1:4002
TRAPMAP_KNOWLEDGE_WRITE_URL=http://127.0.0.1:4003
TRAPMAP_CANDIDATE_INGESTION_URL=http://127.0.0.1:4004
TRAPMAP_GOVERNANCE_REVIEW_URL=http://127.0.0.1:4005
TRAPMAP_JOB_RUNTIME_URL=http://127.0.0.1:4006
```

## Validation

Minimum checks for this migration line:

```bash
pnpm typecheck
pnpm test
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm check:docs-drift
```

## Remaining Gaps

- `packages/server` is still present for retrieval, runtime status/readiness, and legacy read-side compatibility, but it no longer owns candidate/review/maintenance/decay authoritative write orchestration.
- System truth docs still need continued tightening so host-local / host-distributed become the first-class runtime facts everywhere, not only in this guide.
- Distributed host currently establishes service shells and config seams, but it is still earlier-stage than the mature legacy server runtime.

## Rollback

If a migration issue blocks progress, fall back to compatibility entrypoints:

```bash
pnpm dev:server
pnpm dev:server:api
pnpm dev:server:task-worker
pnpm dev:server:outbox-worker
```

That is a temporary escape hatch, not the target architecture.
