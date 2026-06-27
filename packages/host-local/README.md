# @trapmap/host-local

Light-host assembly for TrapMap's `local-agent` and `team-monolith` deployment profiles. The frozen default light mainline is `src/nest/**`; the old Fastify path remains rollback-only during the migration window.

## Purpose

This package is the real `light` host implementation for single-machine TrapMap deployments. `src/nest/**` is the default light mainline; `src/bootstrap/**`, `src/http/**`, and `src/runtime/**` remain only as the Fastify rollback path and must not be described as the long-term default host.

## Deployment Profiles

| Profile | Route Surface | Worker | Database | Auth |
|---|---|---|---|---|
| `local-agent` | Full gateway + governance | In-process when runtime mode owns work | JSON store OK | Single-user full-governance |
| `team-monolith` | Full gateway | In-process task + outbox | PostgreSQL required | Team auth |

## Usage

### Programmatic (via `start()`)

```typescript
import { start } from '@trapmap/host-local';

const handle = await start({
  port: 3000,
  profile: 'local-agent',
  // Provide port implementations ...
});

// handle.close() to shut down
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TRAPMAP_DEPLOYMENT_PROFILE` | `team-monolith` | `local-agent` or `team-monolith` |
| `TRAPMAP_DEPLOYMENT_PRESET` | `monolith` | Deployment preset |
| `RUNTIME_MODE` | `combined` | `api`, `task-worker`, `outbox-worker`, `combined` |
| `PORT` | `4000` | HTTP listen port |
| `DATABASE_URL` | (none) | PostgreSQL connection string |

## Architecture

The host-local package owns `light` host assembly. The Nest path is the frozen default mainline. The legacy Fastify path delegates to `@trapmap/server` only for rollback compatibility and shared runtime/status seam; it is not the default host truth.

```
host-local (HTTP, middleware, lifecycle)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> backend-core modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core invocation model (sync/async, error taxonomy)
```

The host reads the deployment profile from configuration and uses backend-core's `resolveRuntimeDeployment()` to determine which routes to register, which workers to start, and which capabilities to expose.
