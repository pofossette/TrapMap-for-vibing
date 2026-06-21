# @trapmap/host-local

Light-weight local host assembly for TrapMap's `local-agent` and `team-monolith` deployment profiles.

## Purpose

This package is the local entrypoint for single-machine TrapMap deployments. It now reuses the production `@trapmap/server` runtime assembly so `local-agent` and `team-monolith` share the same feedback, review, duplicate-resolution, and skill-governance behavior.

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

The host-local package is a thin bootstrap wrapper. Runtime behavior comes from `@trapmap/server`, so local deployments and the main server share one route surface and one governance implementation.

```
host-local (HTTP, middleware, lifecycle)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> backend-core modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core invocation model (sync/async, error taxonomy)
```

The host reads the deployment profile from configuration and uses backend-core's `resolveRuntimeDeployment()` to determine which routes to register, which workers to start, and which capabilities to expose.
