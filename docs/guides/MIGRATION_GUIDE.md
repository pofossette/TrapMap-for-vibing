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
├── service-knowledge-write/ first implemented service package for authoritative knowledge writes
├── service-governance-review/ second implemented service package for review and feedback assembly
├── service-candidate-ingestion/ third implemented service package for candidate authoritative assembly
├── service-identity-access/ fourth implemented service package for identity/access assembly
├── service-job-runtime/ fifth implemented service package for runtime queue/status assembly
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
- Phase 5 legacy收口: partial. `packages/server` still exists as a compatibility shell and verification surface. In distributed mode, candidate/review/maintenance/decay authoritative writes have moved to `@trapmap/host-distributed`; on the `light` side, default `@trapmap/host-local` Nest mainline now owns candidate/review writes, while the explicit rollback path keeps only retired compatibility behavior plus runtime/status seam.
- Phase 6 physical split execution: in progress. `@trapmap/service-knowledge-write` is the first real `service-*` package, `@trapmap/service-governance-review` is the second, `@trapmap/service-candidate-ingestion` is the third, `@trapmap/service-identity-access` is the fourth, and `@trapmap/service-job-runtime` is the fifth; `@trapmap/host-distributed` consumes all five as thin host adapters, and `packages/server` no longer holds the authoritative `knowledge-write`, `governance-review`, `candidate-ingestion`, `identity-access`, or `job-runtime` assembly facts.

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

Compatibility scripts such as `pnpm dev:server:compat*` still exist, but they are no longer the primary migration target.
The explicit `local-agent` / `team-monolith` rollback path also still exists, but it is rollback-only and no longer the default light entry.

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

Acceptance note: `@trapmap/host-distributed` now consumes built outputs from all five implemented service packages in multi-process acceptance flows. Run `pnpm --filter @trapmap/service-identity-access build`, `pnpm --filter @trapmap/service-knowledge-write build`, `pnpm --filter @trapmap/service-governance-review build`, `pnpm --filter @trapmap/service-candidate-ingestion build`, and `pnpm --filter @trapmap/service-job-runtime build` before standalone `tsx`-driven distributed acceptance if you are not using the packaged `test:distributed-acceptance` entrypoint.

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
pnpm test:distributed-acceptance
pnpm test:runtime-closeout
pnpm typecheck
pnpm test
pnpm test:deployment-smoke
pnpm test:runtime-foundations
pnpm check:docs-drift
```

Microservice-split readiness uses a stricter operational gate. Before starting a physical split, run the checklist in [MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md](./MICROSERVICE_SPLIT_ACCEPTANCE_CHECKLIST.md).

For distributed split readiness, treat `pnpm test:distributed-acceptance` as the default automation gate for Gate 2 / Gate 3 / Gate 5. It is the canonical automated proof that `@trapmap/host-distributed` owns the write forwarding path, preserves auth/error semantics across real internal HTTP hops, and exposes job-runtime ownership through the gateway surface.

Readiness has now moved into execution for the first five physical splits: `knowledge-write` is the first bounded context extracted into a dedicated `service-*` package, `governance-review` is the second, `candidate-ingestion` is the third, `identity-access` is the fourth, and `job-runtime` is the fifth. All five preserve the existing gateway-only external access model and shared PostgreSQL posture.

This gate now includes `packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts`, which starts multiple independent Node processes for gateway, identity-access, candidate-ingestion, governance-review, knowledge-write, and job-runtime. That closeout covers:

- `gateway -> internal service -> knowledge-write` multi-process authoritative write closure
- cross-process `x-request-id` / `x-trace-id` propagation and gateway-only auth validation
- stable `403 / 404 / 409 / 503 / 504` failure mapping without CLI awareness of internal topology
- focused job-runtime stale-running reclaim evidence through the distributed gateway path
- focused outbox retryable failure, dead-letter, and stale-processing reclaim evidence on the same runtime surface

Deployment-level operator closeout now has a separate fixed entrypoint:

```bash
pnpm test:runtime-closeout
```

Run it against a live distributed gateway after `docker compose --profile distributed up -d` or an equivalent deployed runtime. It validates the existing `/v1/operations/status/async` contract rather than introducing a parallel debug surface.

## Remaining Gaps

- `packages/server` is still present for retrieval, runtime status/readiness, and legacy compatibility. It no longer owns distributed-mode maintenance/decay authoritative writes, but candidate/review legacy write orchestration is still present on the current default Fastify path.
- `packages/server` also no longer owns the `knowledge-write` or `governance-review` service assembly. Those assemblies now live in `packages/service-knowledge-write` and `packages/service-governance-review`, with `host-distributed` consuming them directly.
- System truth docs still need continued tightening so host-local / host-distributed become the first-class runtime facts everywhere, not only in this guide.
- Distributed host now has stronger acceptance evidence for remote write ownership and request semantics. Any remaining Gate 5 gap must now be stated only as a specific docker/deployed operator closeout issue, not as read-side immaturity or distributed write-path ambiguity.

## Rollback

If a migration issue blocks progress, fall back to compatibility entrypoints:

```bash
pnpm dev:server:compat
pnpm dev:server:compat:api
pnpm dev:server:compat:task-worker
pnpm dev:server:compat:outbox-worker
```

That is a temporary escape hatch, not the target architecture.
