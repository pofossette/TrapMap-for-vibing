# @trapmap/service-cron

Fastify-based cron scheduling service. Owns the `cron_jobs` registry and the due-job polling scheduler: every tick claims enabled jobs whose `next_run_at` has passed (`FOR UPDATE SKIP LOCKED`), enqueues each as an async task through the injected transport (`transport.task.enqueue`), and records success/failure. The service executes no task business logic — execution, retries, dead-lettering and leases belong to `job-runtime`.

## Boundary Ownership

### Data Ownership

| Owned | Not Owned |
|---|---|
| `cron-jobs` | `task-queue` |
| | `domain-event-outbox` |

### Sync Boundary

This service owns the cron job registry and schedule state (create/update/pause/resume/trigger/delete). It never executes task business logic synchronously.

### Async Boundary

Due cron jobs are enqueued into the async task queue as follow-up work. `job-runtime` owns queue/outbox transport, lease, reclaim, retry, and dead-letter runtime. Manual `trigger` performs an immediate enqueue without advancing `next_run_at` (semantically an extra execution).

## Package Structure

```text
src/
  index.ts                      Public barrel exports
  deps.ts                       Service module composition (CRUD + trigger orchestration)
  server.ts                     Fastify server factory
  routes.ts                     HTTP route registration (RouteDefs)
  scheduler.ts                  Due-job poller (claim -> enqueue -> bookkeeping)
  pg-ports.ts                   PostgreSQL owner bundle — all cron_jobs SQL
  migrations.ts                 Drizzle migration runner
drizzle/
  0000_cron_jobs.sql            Initial migration (cron_jobs table)
```

## Public API

### Service Composition

```typescript
import {
  createCronOwnerBundle,
  createCronScheduler,
  createCronServer,
} from '@trapmap/service-cron';

const bundle = createCronOwnerBundle(pool);
const scheduler = createCronScheduler({
  bundle,
  transport: { task: { enqueue: (type, payload, options) => transport.task.enqueue(type, payload, options) } },
  pollIntervalMs: 1000,
  ownsWork: true,
});

const server = await createCronServer(
  { host: '0.0.0.0', port: 4007, logLevel: 'info' },
  { bundle, scheduler, transport },
);
await server.start();
await scheduler.run(); // start the polling loop
```

### Scheduler

```typescript
const scheduler = createCronScheduler({ bundle, transport, ownsWork: true });
await scheduler.run();   // start the polling loop
await scheduler.tick();  // claim due jobs once (also used by the loop)
await scheduler.stop();  // graceful stop (waits for the in-flight tick)
scheduler.isRunning();
scheduler.ownsWork();    // false keeps a standby instance idle
```

### Migrations

```typescript
import { runCronMigrations, assertCronMigrationSet } from '@trapmap/service-cron';

await assertCronMigrationSet();
await runCronMigrations(pool);
```

## HTTP Routes

### Cron Jobs

| Method | Path | Description |
|---|---|---|
| `GET` | `/cron/jobs` | List all jobs |
| `POST` | `/cron/jobs` | Create a job (requires `x-trapmap-actor-id`) |
| `GET` | `/cron/jobs/:id` | Fetch one job |
| `PATCH` | `/cron/jobs/:id` | Update a job (requires `x-trapmap-actor-id`; schedule edits require `timezone`) |
| `DELETE` | `/cron/jobs/:id` | Delete a job (requires `x-trapmap-actor-id`) |
| `POST` | `/cron/jobs/:id/trigger` | Immediate manual run, does not advance `next_run_at` (requires `x-trapmap-actor-id`) |
| `GET` | `/cron/status` | Status snapshots for all jobs |

### Health & Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/internal/health` | Basic liveness with ownership claim |
| `GET` | `/internal/live` | Liveness (no dependency check) |
| `GET` | `/internal/readiness` | Readiness with optional transport reachability |
| `GET` | `/internal/ready` | Same as readiness |
| `GET` | `/internal/ownership` | Full static ownership declaration |
| `GET` | `/internal/operator-status` | Scheduler running state + operator diagnostics |

## Error Semantics

The service uses the shared `InvocationError` classification: `validation` (400) for invalid cron expressions/timezones, `not-found` (404) for unknown job ids, `unavailable` (503) for missing dependencies, `internal` (500) otherwise.

## Dependencies

### TrapMap Workspace Packages

| Package | Usage |
|---|---|
| `@trapmap/backend-core` | `InvocationError`, `computeNextRun`, RouteDef/server factories |
| `@trapmap/contracts` | Cron job schemas and types |
| `@trapmap/lib` | `cronValidate`, `prefixedId` |
| `@trapmap/persistence-schema` | `cronJobs` table (single source, `getTableName`) |

### External

| Package | Usage |
|---|---|
| `fastify` | HTTP server framework |
| `drizzle-orm` | Database migration runner |
| `pg` | PostgreSQL client |

## Tests

| Test File | Coverage |
|---|---|
| `src/pg-ports.test.ts` | Owner bundle SQL + row mapping + schedule validation |
| `src/scheduler.test.ts` | Due delivery, dedupe keys, failure retention, pause skip, single claim |
| `src/routes.test.ts` | Route handlers (CRUD/trigger/status, auth gate, error wire) on fastify + nest adapters |
| `src/server.test.ts` | Server composition |
| `src/migrations.test.ts` | Migration runner |

## Validation

```bash
pnpm --filter @trapmap/service-cron test
pnpm typecheck
pnpm exec fallow audit --base main
```

## Related Docs

- Design spec: [`docs/superpowers/specs/2026-08-16-cron-and-skill-versioning-design.md`](../../docs/superpowers/specs/2026-08-16-cron-and-skill-versioning-design.md)
- Table schema: [`docs/reference/DATABASE_SCHEMA.md`](../../docs/reference/DATABASE_SCHEMA.md)
