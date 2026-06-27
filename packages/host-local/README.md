# @trapmap/host-local

Light-host assembly for TrapMap's `local-agent` and `team-monolith` deployment profiles. The frozen default light mainline is `src/nest/**`.

## Purpose

This package is the real `light` host implementation for single-machine TrapMap deployments. `src/nest/**` is the default and only host mainline.

## Deployment Profiles

| Profile | Route Surface | Worker | Database | Auth |
|---|---|---|---|---|
| `local-agent` | Full gateway + governance | In-process when runtime mode owns work | JSON store OK | Single-user full-governance |
| `team-monolith` | Full gateway | In-process task + outbox | PostgreSQL required | Team auth |

## Usage

### Programmatic (via `start()`)

下方 `start()` 示例对应默认 Nest 主线。

```typescript
import { start } from '@trapmap/host-local';

const handle = await start({
  port: 3000,
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

The host-local package owns `light` host assembly. The Nest path is the frozen default mainline and the only supported local host entry.

```
host-local (HTTP, middleware, lifecycle)
  -> backend-core ports (repo, queue, retrieval, actor, audit)
  -> backend-core modules (identity, knowledge, candidates, governance, jobs)
  -> backend-core invocation model (sync/async, error taxonomy)
```

The host reads the deployment profile from configuration and uses backend-core's `resolveRuntimeDeployment()` to determine which routes to register, which workers to start, and which capabilities to expose.
