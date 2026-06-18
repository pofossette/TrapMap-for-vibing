# @trapmap/host-local

Light-weight local host assembly for TrapMap's `local-agent` and `team-monolith` deployment profiles.

## Purpose

This package assembles the backend-core kernel into a runnable process with an HTTP server and optional in-process worker. It provides the entry point for single-machine TrapMap deployments, replacing the monolithic `packages/server` with a capability-driven host that only wires what the deployment profile requires.

## Deployment Profiles

| Profile | Route Surface | Worker | Database | Auth |
|---|---|---|---|---|
| `local-agent` | Minimal retrieval-only | None | JSON store OK | Single-user |
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
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | (none) | PostgreSQL connection string |

## Architecture

The host-local package is a **transport and lifecycle assembly only**. It contains no business logic. All domain behavior is delegated to backend-core modules through port interfaces:

```
host-local (HTTP, middleware, lifecycle)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> backend-core modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core invocation model (sync/async, error taxonomy)
```

The host reads the deployment profile from configuration and uses backend-core's `resolveRuntimeDeployment()` to determine which routes to register, which workers to start, and which capabilities to expose.
