# Runtime Recomposition Summary

## Status

- Status: `active-reference`
- Created: `2026-06-18`
- Last Updated: `2026-06-18`
- Purpose: summarize what runtime recomposition has already landed, what remains partial, and how to reason about the migration state

## Overview

Runtime recomposition has crossed the structural threshold. TrapMap is no longer only a `cli + server` codebase in practice:

- `packages/client-core` exists and is consumed by CLI
- `packages/backend-core` exists and carries the host-agnostic runtime model
- `packages/host-local` exists and now backs root `local-agent` / `team-monolith` development entrypoints
- `packages/host-distributed` exists and now backs root `distributed` development entrypoints

What is not true yet is “migration fully complete”:

- `packages/server` still remains as a compatibility shell and large implementation surface
- host-local does not yet have full parity with the mature legacy route/runtime surface
- several distributed pieces are still seams/stubs rather than production-hardened replacements

## What Landed

### Shared client core

- `packages/client-core/` provides a reusable gateway transport layer
- CLI now consumes that layer through an adapter instead of owning the HTTP transport boundary directly
- session management is expressed through a provider contract rather than baked into the transport implementation

### Backend core kernel

- `packages/backend-core/` holds the shared runtime capability model
- ports, invocation seams, and bounded-context modules are split out of host-specific code
- this gives both light and heavy hosts a common kernel rather than duplicating business logic

### Host-local

- `packages/host-local/` assembles the backend core for `local-agent` and `team-monolith`
- root `pnpm dev:local-agent` and `pnpm dev:team-monolith` now point at this host
- default local gateway behavior remains aligned to `http://127.0.0.1:4000`

### Host-distributed

- `packages/host-distributed/` assembles the distributed service topology
- root `pnpm dev:distributed:gateway`
- root `pnpm dev:distributed:candidate-worker`
- root `pnpm dev:distributed:governance-worker`
- root `pnpm dev:distributed:outbox-worker`
- these now point at distributed host entrypoints rather than the legacy server scripts

### Migration documentation and validation

- migration guide exists: [docs/guides/MIGRATION_GUIDE.md](../guides/MIGRATION_GUIDE.md)
- validation matrix exists: [docs/operations/VALIDATION_MATRIX.md](../operations/VALIDATION_MATRIX.md)
- repo/package structure docs now include the new packages and host roles

## What Changed In Practice

### Preferred development entrypoints

Use these first:

```bash
pnpm dev:local-agent
pnpm dev:team-monolith
pnpm dev:distributed:gateway
pnpm dev:distributed:candidate-worker
pnpm dev:distributed:governance-worker
pnpm dev:distributed:outbox-worker
```

Compatibility scripts still exist, but are no longer the primary migration target:

```bash
pnpm dev:server
pnpm dev:server:api
pnpm dev:server:task-worker
pnpm dev:server:outbox-worker
```

### Database env compatibility

New hosts now accept both:

- `TRAPMAP_DATABASE_URL`
- `DATABASE_URL`

Distributed per-service override remains:

- `TRAPMAP_SERVICE_DATABASE_URL`

This was necessary to keep existing `.env`, docs, and test workflows functional while the migration remains partial.

## What Was Preserved

- existing external API assumptions remain centered on the gateway-only model
- CLI still only needs one gateway URL
- PostgreSQL remains the shared substrate for the current migration stage
- existing tests continue to pass against the current codebase

## Current Gaps

These are the meaningful unresolved items, not cosmetic leftovers:

1. `packages/server` still owns a large amount of real implementation and remains part of the truth surface.
2. `host-local` is structurally present but not yet feature-complete relative to the full mature legacy runtime.
3. some worker/outbox behavior in new hosts is still seam-oriented or stub-like rather than fully hardened.
4. distributed host service shells exist, but full operational maturity and parity are still behind the legacy implementation surface.

## Current Validation State

Already true:

- root dev scripts prefer the new hosts
- docs high-frequency entrypoints have been updated to reflect that
- typecheck passes
- doc-drift checks pass
- current test suite passes

Still required for real migration completion:

- full manual smoke across `local-agent`, `team-monolith`, and `distributed`
- stronger parity validation for route surfaces and runtime behavior
- shrinkdown or retirement plan for `packages/server`

## How To Read The Repo Now

Use this mental model:

- `client-core` is the client-side shared transport/kernel
- `backend-core` is the server-side shared kernel
- `host-local` and `host-distributed` are the intended runtime assemblies
- `server` is still the main compatibility and implementation surface for many internals, tests, and migration-era facts

That means “new architecture exists” and “legacy surface still matters” are both true at the same time.

## Conclusion

Runtime recomposition is structurally successful but operationally incomplete.

The important milestone has been reached:

- shared client layer exists
- shared backend kernel exists
- light and heavy host assemblies exist
- root developer workflows now prefer the new hosts

The remaining work is convergence:

- route/runtime parity
- hardening distributed behavior
- reducing dependency on the legacy server shell
- eventually retiring `packages/server` as the primary implementation surface
