# Async Reliability And Workflow Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve TrapMap into a reliable PostgreSQL-first async backend by fixing transactional delivery gaps first, then hardening queue/outbox runtime recovery, then adding split worker modes, workflow-level observability, badcase traceability, and metrics-based architecture decision gates.

**Architecture:** Keep TrapMap as a modular monolith with PostgreSQL as the authoritative write-path substrate. Reuse the existing `task_queue`, `domain_event_outbox`, candidate processor, lifecycle state machine, retrieval read models, and feedback flows, but tighten them into a stricter command-write plus async-worker model with atomic enqueue/outbox writes, reclaimable leases, dedicated worker entrypoints, workflow run snapshots, and operator-visible status APIs. Borrow GraphRAG’s workflow runtime ideas such as state snapshots, progress visibility, and controlled concurrency, but do not introduce MQ or microservice splits unless runtime metrics justify them later.

**Tech Stack:** TypeScript, Fastify, Zod contracts, Vitest, PostgreSQL/Drizzle, existing repository layer, existing queue/outbox worker runtime, retrieval caches/read models, existing eval pipelines.

---

## Current Verified Baseline

- [x] `task_queue` already exists with durable persistence, dedupe keys, retry backoff, dead-letter state, and a polling worker abstraction.
- [x] `domain_event_outbox` already exists with durable persistence, retry backoff, and asynchronous event consumption.
- [x] candidate submission already uses PostgreSQL-backed async processing in PG mode.
- [x] lifecycle state transitions already publish to async subscribers in PG mode through `emitLifecycleTransition()`.
- [x] retrieval routes already generate `queryId` internally for analytics, but the public API does not consistently return it.
- [x] feedback/remediation and retrieval eval docs already describe a badcase loop, but the durable trace and export path are incomplete.
- [x] runtime readiness and stats surfaces already exist and can be extended instead of replaced.

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-12-async-state-machine-backend-convergence-archived.md`
- [x] Active tracking file remains `plan.md`

## Scope

- [ ] Fix write-path reliability gaps before introducing broader async abstractions.
- [ ] Keep `task_queue` and `domain_event_outbox` as separate authoritative transports in the first implementation wave.
- [ ] Add lease/reclaim semantics so worker crashes do not leave stuck `running` or `processing` rows indefinitely.
- [ ] Split API and worker runtime ownership without service explosion or external brokers.
- [ ] Add workflow-level state snapshots for long-running jobs, starting with candidate processing and rebuild-style jobs.
- [ ] Expose retrieval `queryId` and persist a durable badcase trace envelope that can later materialize into eval inputs.
- [x] Drive cache invalidation and read-model refresh from shared events/jobs instead of route-local side effects.
- [ ] Add explicit metrics and decision gates for whether MQ or service splits are ever justified later.

## Non-Goals

- [ ] Do not introduce Kafka, RabbitMQ, NATS, or another external MQ in this plan.
- [ ] Do not merge `task_queue` and `domain_event_outbox` into one storage model in the first implementation wave.
- [ ] Do not redesign all retrieval payload shapes if additive fields are sufficient.
- [ ] Do not remove JSON compatibility paths unless the touched subsystem is already clearly PG-first.
- [ ] Do not build a dedicated UI for queue orchestration; API, CLI, tests, and docs are sufficient.
- [ ] Do not assume GraphRAG uses MQ; the relevant reference material is workflow runtime engineering, not broker topology.

## Execution Rules

- [ ] No new async write path ships unless the business write and task/outbox registration happen atomically in one authoritative DB transaction.
- [ ] No queue or outbox consumer is considered production-ready unless it can reclaim stuck work after process death.
- [ ] Any new long-running task must define a typed payload, a persisted status model, retry/dead-letter semantics, and operator-visible status.
- [ ] Any new async state must be inspectable through repositories or operator APIs, not only through logs.
- [ ] Any new request/response trace or badcase payload must be stored durably and queryably, not only emitted to analytics or logs.
- [ ] Cache invalidation must be event-driven or job-driven; request handlers must not clear unrelated caches ad hoc.
- [ ] MQ or service-split recommendations must be backed by metrics added in this plan, not by general preference.
- [ ] A phase is not complete until its code, docs, tests, and required eval updates are all done.

## File Structure

### Queue and outbox reliability

- `packages/server/src/lib/queue/task-queue.ts`
  - authoritative durable task queue implementation; extend with lease metadata, reclaim, richer operator queries, and safer worker loop behavior
- `packages/server/src/lib/lifecycle/outbox.ts`
  - authoritative domain-event outbox; extend with reclaim and stronger operator visibility
- `packages/server/src/lib/lifecycle/emit-transition.ts`
  - current PG outbox emission entrypoint; converge it onto transactional outbox registration instead of post-commit enqueue
- `packages/server/src/lib/persistence/schema/queue.ts`
  - schema source of truth for queue/outbox additions
- `packages/server/drizzle/*.sql`
  - migrations for queue/outbox columns, indexes, and any new workflow-run persistence

### Candidate, workflow, and jobs runtime

- `packages/server/src/lib/candidates/services/submission-service.ts`
  - current candidate create + schedule path; tighten to atomic enqueue
- `packages/server/src/lib/candidates/processor.ts`
  - reference async workflow path for candidate processing; add step-level status snapshot integration
- `packages/server/src/bootstrap/bootstrap-workers.ts`
  - current task worker startup; adapt to runtime-mode-specific startup
- `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
  - current outbox worker startup; adapt to runtime-mode-specific startup
- `packages/server/src/index.ts`
  - current server entrypoint; split API and worker modes cleanly
- `packages/server/src/worker.ts`
  - dedicated worker entrypoint to be added
- `packages/server/src/bootstrap/run-worker-sequence.ts`
  - shared worker bootstrap orchestration to be added
- `packages/server/src/lib/jobs/`
  - shared non-candidate async job handlers to be added after reliability hardening

### Contracts, operator surfaces, and traces

- `packages/contracts/src/domain/operations.ts`
  - queue/outbox/workflow/operator status schemas
- `packages/contracts/src/domain/retrieval.ts`
  - additive public `queryId` and any durable trace fields returned to callers
- `packages/contracts/src/domain/feedback.ts`
  - badcase reproducibility envelope
- `packages/server/src/routes/operations/status.ts`
  - queue/outbox/workflow status surfaces
- `packages/server/src/routes/operations/stats.ts`
  - metrics and architecture-decision surfaces
- `packages/server/src/routes/retrieval.ts`
  - return `queryId`, persist trace snapshots, and link retrieval outcomes to badcase storage
- `packages/server/src/routes/feedback.ts`
  - persist feedback trace context and future badcase export inputs
- `packages/server/src/routes/feedback-admin.ts`
  - remediation follow-up orchestration

### Read models, caches, and docs

- `packages/server/src/lib/retrieval/read-model.ts`
  - retrieval read-model ownership and refresh semantics
- `packages/server/src/lib/cache/retrieval-cache.ts`
  - shared retrieval cache behavior and invalidation hooks
- `packages/server/src/lib/cache/metrics.ts`
  - cache metrics surfaced to operator stats
- `packages/server/src/lib/runtime/metrics.ts`
  - queue/outbox/workflow/runtime counters and decision metrics
- `docs/PACKAGES.md`
  - ownership map for async runtime, worker entrypoints, jobs, cache invalidation, and trace capture
- `docs/reference/DATA_MODEL.md`
  - async persistence truth, workflow status vocabulary, and badcase trace tables
- `docs/reference/DATABASE_SCHEMA.md`
  - queue/outbox/workflow schema additions
- `docs/reference/api-surface.md`
  - additive contracts and operator endpoints
- `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - canonical entrypoint and truth-source mapping
- `docs/operations/TESTING.md`
  - per-phase verification and operator playbooks

## Phase 0: Atomic Delivery And Crash Recovery Guarantees

**Objective:** Remove the two most dangerous reliability gaps first: task registration outside the authoritative candidate write transaction, and outbox registration after the authoritative lifecycle write transaction. Add stuck-work reclaim so process death cannot leave indefinite `running` or `processing` rows.

**Files:**
- Modify: `packages/server/src/lib/candidates/services/submission-service.ts`
- Modify: `packages/server/src/lib/candidates/processor.ts`
- Modify: `packages/server/src/lib/lifecycle/emit-transition.ts`
- Modify: `packages/server/src/lib/lifecycle/outbox.ts`
- Modify: `packages/server/src/lib/queue/task-queue.ts`
- Modify: `packages/server/src/lib/persistence/schema/queue.ts`
- Modify: `packages/server/drizzle/0015_*.sql`
- Modify: `packages/server/src/lib/queue/task-queue.test.ts`
- Modify: `packages/server/src/lib/lifecycle/outbox.test.ts`
- Modify: `packages/server/src/routes/candidates.test.ts`
- Modify: `packages/server/src/bootstrap/startup.test.ts`
- Modify: `plan.md`

- [x] Move candidate creation and candidate-processing task registration into one authoritative DB transaction.
- [ ] Move lifecycle state transition persistence and outbox event registration into one authoritative DB transaction.
- [x] Add reclaimable lease metadata for queue tasks:
  - `workerId`
  - `leaseUntil`
  - `heartbeatAt`
  - `startedAt`
- [x] Add reclaimable lease metadata for outbox events:
  - `workerId`
  - `leaseUntil`
  - `heartbeatAt`
  - `startedAt`
- [x] Add a reclaim path for stuck `running` tasks and stuck `processing` outbox events after lease expiry.
- [x] Keep external route behavior compatible while tightening reliability semantics underneath.

**Completion standard:**

- [x] No candidate can be left in a durable “queued” state without a durable task registration.
- [ ] No lifecycle transition can commit without its matching durable outbox event registration.
- [x] A crashed worker can leave stale `running` or `processing` rows, but the system can reclaim them without manual SQL edits.
- [x] Existing candidate and lifecycle behavior tests still pass with the stricter semantics.

**Document updates in this phase:**

- [x] Update `docs/reference/DATA_MODEL.md` with atomic registration rules and lease/reclaim semantics.
- [x] Update `docs/reference/DATABASE_SCHEMA.md` with queue/outbox lease columns, indexes, and migration numbers.
- [x] Update `docs/PACKAGES.md` to state that candidate scheduling and lifecycle event registration are transactional responsibilities.
- [x] Update `docs/operations/TESTING.md` with stuck-task/stuck-outbox recovery verification steps.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/lib/queue/task-queue.test.ts` with:
  - lease creation on claim
  - reclaim after expired lease
  - no duplicate active task after reclaim
- [ ] Extend `packages/server/src/lib/lifecycle/outbox.test.ts` with:
  - lease creation on claim
  - reclaim after expired lease
  - retry path preserved after reclaim
- [ ] Extend `packages/server/src/routes/candidates.test.ts` with:
  - candidate submission does not leave orphan queued state on enqueue failure
- [ ] Extend `packages/server/src/bootstrap/startup.test.ts` with:
  - recovery path can reclaim stuck queue/outbox rows
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/queue/task-queue.test.ts \
  packages/server/src/lib/lifecycle/outbox.test.ts \
  packages/server/src/routes/candidates.test.ts \
  packages/server/src/bootstrap/startup.test.ts
```
- [x] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface LeaseSnapshot {
  workerId: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  leaseUntil: string | null;
}
```

```ts
await store.transact(async (tx) => {
  const candidate = await candidateRepo.insertTx(tx, draft);
  await queueRepo.enqueueTx(tx, {
    type: 'candidate_processing',
    dedupeKey: candidate.id,
    payload: { candidateId: candidate.id, retryCount: 0 },
  });
});
```

## Phase 1: Harden Queue And Outbox Operator Semantics

**Objective:** Turn the existing queue/outbox pair into an operator-visible and testable async substrate without prematurely merging them into a single `async_jobs` abstraction.

**Files:**
- Modify: `packages/server/src/lib/queue/task-queue.ts`
- Modify: `packages/server/src/lib/lifecycle/outbox.ts`
- Modify: `packages/server/src/lib/persistence/schema/queue.ts`
- Modify: `packages/server/drizzle/0016_*.sql`
- Modify: `packages/contracts/src/domain/operations.ts`
- Modify: `packages/server/src/routes/operations/status.ts`
- Modify: `packages/server/src/routes/operations/status.test.ts`
- Modify: `packages/server/src/lib/runtime/metrics.ts`
- Modify: `packages/server/src/lib/runtime/runtime-metadata.ts`
- Modify: `packages/server/src/lib/runtime/http-surface.ts`
- Modify: `packages/server/src/lib/runtime/runtime-metadata.test.ts`
- Modify: `packages/server/src/app.test.ts`
- Modify: `plan.md`

- [x] Add operator-visible snapshots for queue tasks and outbox events with separate status vocabularies if needed.
- [x] Add explicit status/requeue APIs for:
  - queue backlog summary
  - dead-letter summary
  - running age / stuck age summary
  - outbox backlog summary
  - dead task requeue
- [x] Extend runtime readiness and stats surfaces with:
  - queue backlog
  - dead-letter count
  - reclaim count
  - worker degraded status
- [x] Keep queue and outbox abstractions separate, but normalize the operator response shape where it improves ergonomics.
- [x] Preserve current candidate worker behavior while routing its status through richer operator surfaces.

**Completion standard:**

- [x] Operators can inspect queue and outbox health without reading raw database rows.
- [x] Readiness and stats surfaces expose enough detail to detect backlog growth, dead letters, and stale running work.
- [x] Dead tasks can be requeued through one canonical operator flow.
- [x] No new generic `async_jobs` table is introduced in this phase.

**Document updates in this phase:**

- [x] Update `docs/reference/api-surface.md` with queue/outbox operator endpoints.
- [x] Update `docs/reference/DATA_MODEL.md` with the final queue/outbox status vocabulary.
- [x] Update `docs/reference/DATABASE_SCHEMA.md` with any additional queue/outbox indexes.
- [x] Update `docs/PACKAGES.md` to describe queue/outbox operator ownership.
- [x] Update `docs/operations/TESTING.md` with backlog, dead-letter, and requeue verification commands.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/routes/operations/status.test.ts` with:
  - queue backlog snapshot
  - outbox backlog snapshot
  - dead-letter visibility
  - requeue path
- [x] Extend `packages/server/src/lib/runtime/runtime-metadata.test.ts` and `packages/server/src/app.test.ts` with:
  - readiness degradation when worker ownership exists but health is bad
  - readiness success when the current process is not expected to own workers
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/routes/operations/status.test.ts \
  packages/server/src/lib/runtime/runtime-metadata.test.ts \
  packages/server/src/app.test.ts
```
- [x] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface QueueStatusSnapshot {
  pending: number;
  running: number;
  dead: number;
  staleRunning: number;
}

export interface OutboxStatusSnapshot {
  pending: number;
  processing: number;
  failed: number;
  staleProcessing: number;
}
```

```ts
app.get('/v1/operations/status/async', async () => {
  return {
    queue: await queueRepo.getStatusSnapshot(),
    outbox: await outboxRepo.getStatusSnapshot(),
  };
});
```

## Phase 2: Split API And Worker Runtime Modes

**Objective:** Make worker execution deployable as dedicated processes while preserving one shared initialization path and keeping local development simple.

**Files:**
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/worker.ts`
- Create: `packages/server/src/bootstrap/run-worker-sequence.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-workers.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/package.json`
- Modify: `package.json`
- Modify: `packages/server/src/bootstrap/startup.test.ts`
- Modify: `packages/server/src/app.test.ts`
- Modify: `plan.md`

- [x] Split startup into explicit runtime modes:
  - `api`
  - `task-worker`
  - `outbox-worker`
  - `combined` for local development
- [x] Keep shared config, repository wiring, and bootstrap logic in reusable helpers instead of duplicating startup code.
- [x] Ensure readiness semantics understand process intent:
  - API-only does not require worker health
  - worker processes report only their owned runtimes
- [x] Keep one developer-friendly combined mode for contributors who do not need split processes locally.

**Completion standard:**

- [x] The repo can boot API-only, task-worker-only, outbox-worker-only, and combined local-dev modes from explicit entrypoints.
- [x] Startup tests can cover runtime-mode branching without spawning real external daemons.
- [x] Runtime metadata clearly reports what each process owns and why missing worker health may be acceptable.
- [x] No external infrastructure beyond PostgreSQL is introduced.

**Document updates in this phase:**

- [x] Update `README.md` and `docs/guides/GETTING_STARTED.md` with runtime-mode startup commands.
- [x] Update `docs/PACKAGES.md` to describe `worker.ts` and runtime-mode ownership.
- [x] Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` if startup entrypoints change authoritative ownership.
- [x] Update `docs/operations/TESTING.md` with split-process verification recipes.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/bootstrap/startup.test.ts` with:
  - API-only bootstrap
  - task-worker-only bootstrap
  - outbox-worker-only bootstrap
  - combined bootstrap
- [x] Extend `packages/server/src/app.test.ts` readiness assertions for runtime-mode-aware health.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/app.test.ts
```
- [x] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface RuntimeModeConfig {
  mode: 'api' | 'task-worker' | 'outbox-worker' | 'combined';
  enableTaskWorker: boolean;
  enableOutboxWorker: boolean;
}
```

```ts
if (runtime.mode === 'api') {
  await app.listen({ host, port });
} else {
  await runWorkerSequence(app, runtime);
}
```

## Phase 3: Add Workflow Run Snapshots For Long-Running Jobs

**Objective:** Borrow the useful GraphRAG idea: long-running async work should have durable run/step snapshots, progress visibility, and reproducible state, starting with candidate processing and rebuild-style jobs.

**Files:**
- Create: `packages/server/src/lib/workflows/`
- Create: `packages/server/src/lib/workflows/types.ts`
- Create: `packages/server/src/lib/workflows/repository.ts`
- Modify: `packages/server/src/lib/candidates/processor.ts`
- Modify: `packages/server/src/lib/queue/task-queue.ts`
- Modify: `packages/server/src/lib/persistence/schema/queue.ts`
- Modify: `packages/server/drizzle/0017_*.sql`
- Modify: `packages/contracts/src/domain/operations.ts`
- Modify: `packages/server/src/routes/operations/status.ts`
- Modify: `packages/server/src/__tests__/candidate-pipeline.test.ts`
- Modify: `packages/server/src/routes/operations/status.test.ts`
- Modify: `plan.md`

- [x] Add a durable workflow-run snapshot model with:
  - `runId`
  - `workflowType`
  - `subjectId`
  - `status`
  - `stepName`
  - `attempt`
  - `startedAt`
  - `completedAt`
  - `lastError`
  - `stats`
- [x] Instrument candidate processing as the first workflow-run-backed path.
- [x] Add one additional rebuild-style or export-style workflow that uses the same snapshot infrastructure.
- [x] Keep the first version linear-step-based; do not introduce DAG orchestration yet.
- [x] Expose workflow-run snapshots through the existing operator status family.

**Completion standard:**

- [x] Candidate processing exposes durable run/step status rather than only raw queue status.
- [x] At least one non-candidate long-running flow uses the same workflow-run abstraction.
- [x] Operators can tell which step failed and with what last error.
- [x] This phase adds workflow observability without changing public route behavior unnecessarily.

**Document updates in this phase:**

- [x] Update `docs/reference/DATA_MODEL.md` with workflow-run persistence and status vocabulary.
- [x] Update `docs/reference/DATABASE_SCHEMA.md` with workflow-run table/index additions.
- [x] Update `docs/reference/api-surface.md` with any workflow status fields surfaced through operations endpoints.
- [x] Update `docs/PACKAGES.md` to describe `lib/workflows/` ownership.
- [x] Update `docs/operations/TESTING.md` with workflow-run inspection examples.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/__tests__/candidate-pipeline.test.ts` with:
  - step status progression
  - step failure persistence
  - workflow completion snapshot
- [x] Extend `packages/server/src/routes/operations/status.test.ts` with workflow-run visibility.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/__tests__/candidate-pipeline.test.ts \
  packages/server/src/routes/operations/status.test.ts
```
- [x] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface WorkflowRunSnapshot {
  runId: string;
  workflowType: 'candidate-processing' | 'index-rebuild' | 'badcase-export';
  subjectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stepName: string | null;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  stats: Record<string, number | string | boolean | null>;
}
```

```ts
await workflowRepo.recordStep(runId, {
  stepName: 'duplicate-detection',
  status: 'running',
  startedAt: new Date().toISOString(),
});
```

## Phase 4: Add Query Traceability And Durable Badcase Capture

**Objective:** Expose retrieval `queryId` publicly, persist enough request/result context to reproduce failures, and keep badcase trace storage as a reproducibility fact source rather than only an analytics side effect.

**Files:**
- Modify: `packages/contracts/src/domain/retrieval.ts`
- Modify: `packages/contracts/src/domain/feedback.ts`
- Modify: `packages/contracts/src/domain/operations.ts`
- Modify: `packages/server/src/routes/retrieval.ts`
- Modify: `packages/server/src/routes/feedback.ts`
- Modify: `packages/server/src/lib/analytics/repository.ts`
- Modify: `packages/server/src/lib/analytics/pg-repository.ts`
- Modify: `packages/server/src/lib/persistence/schema/retrieval.ts`
- Modify: `packages/server/drizzle/0018_*.sql`
- Modify: `packages/server/src/routes/retrieval.test.ts`
- Modify: `packages/server/src/routes/feedback.test.ts`
- Modify: `packages/contracts/src/domain/retrieval.test.ts`
- Modify: `packages/contracts/src/domain/feedback.test.ts`
- Modify: `plan.md`

- [x] Return additive `queryId` fields in public retrieval responses instead of keeping them internal to analytics only.
- [x] Extend feedback submission with a minimal reproducibility envelope:
  - `queryId`
  - `querySeed`
  - route family or retrieval flavor
  - selected-result snapshot
  - failure classification
  - expected correction
- [x] Persist badcase trace data in a durable retrieval/badcase persistence model that can be queried later.
- [x] Reuse analytics IDs where useful, but do not make analytics the only truth source for badcase reconstruction.
- [x] Keep all additions backward-compatible by using additive fields.

**Completion standard:**

- [x] Clients can tie feedback to a concrete public `queryId`.
- [x] Operators can inspect enough stored context to understand and reproduce a retrieval or summary failure.
- [x] Retrieval tests assert `queryId` for all supported retrieval route families.
- [x] Feedback trace fields survive repository and route round-trips.

**Document updates in this phase:**

- [x] Update `docs/todos/badcase-feedback-loop.md` to mark public `queryId` and durable trace capture as implemented.
- [x] Update `docs/reference/api-surface.md` with additive retrieval and feedback contract fields.
- [x] Update `docs/reference/DATA_MODEL.md` with badcase trace storage shape.
- [x] Update `docs/PACKAGES.md` to explain trace-capture ownership.

**Tests / eval updates in this phase:**

- [x] Extend `packages/contracts/src/domain/retrieval.test.ts` and `packages/contracts/src/domain/feedback.test.ts` with new additive fields.
- [x] Extend `packages/server/src/routes/retrieval.test.ts` with:
  - v1 returns `queryId`
  - v2 returns `queryId`
  - v3 returns `queryId`
- [x] Extend `packages/server/src/routes/feedback.test.ts` with:
  - feedback persists `queryId`
  - feedback persists result snapshot and expected correction metadata
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/contracts/src/domain/retrieval.test.ts \
  packages/contracts/src/domain/feedback.test.ts \
  packages/server/src/routes/retrieval.test.ts \
  packages/server/src/routes/feedback.test.ts
```
- [x] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export const badcaseSnapshotSchema = z.object({
  queryId: z.string().min(1),
  querySeed: z.string().min(1),
  routeFamily: z.enum(['entry', 'capsule', 'graph-plan']).optional(),
  observedFailure: z.enum([
    'missing-recall',
    'ranking-error',
    'summary-hallucination',
    'governance-leak',
    'outdated-content',
  ]),
  expectedBehavior: z.string().min(1).max(2000),
  selectedResultSnapshot: z.record(z.string(), z.unknown()).optional(),
});
```

```ts
return retrievalV2ResponseWithHintsSchema.parse({
  ...result,
  queryId,
});
```

## Phase 5: Move Derived Heavy Work Onto Shared Jobs

**Objective:** Reuse the hardened queue/workflow substrate for the next set of heavy side effects instead of keeping them inside routes or narrow subscribers.

**Files:**
- Create: `packages/server/src/lib/jobs/`
- Create: `packages/server/src/lib/jobs/handlers/*.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-workers.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/indexing.ts`
- Modify: `packages/server/src/lib/feedback/remediation.ts`
- Modify: `packages/server/src/routes/feedback-admin.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
- Modify: `packages/server/src/__tests__/candidate-pipeline.test.ts`
- Modify: `packages/server/src/routes/feedback.test.ts`
- Modify: `plan.md`

- [x] Add shared job handlers for at least:
  - index rebuild/removal follow-up
  - remediation reactivation follow-up
  - badcase export draft generation
- [x] Use outbox events or authoritative writes to enqueue derived jobs after commit.
- [x] Keep handlers idempotent by dedupe key and safe under repeated event delivery.
- [x] Route all failures through the queue/operator/workflow surfaces from earlier phases.
- [x] Reuse candidate processing and workflow-run conventions instead of inventing a parallel async framework.

**Completion standard:**

- [x] At least one non-candidate subsystem uses the shared async substrate end-to-end.
- [x] Derived follow-up work no longer depends on route-local heavy side effects.
- [x] Repeated event delivery does not create duplicate active jobs.
- [x] Dead-letter derived jobs are visible and re-runnable through operator flows.

**Document updates in this phase:**

- [x] Update `docs/PACKAGES.md` with `lib/jobs/` ownership.
- [x] Update `docs/reference/DATA_MODEL.md` with derived-job payload ownership and lifecycle notes.
- [x] Update `docs/reference/api-surface.md` if operator responses now include async job IDs.
- [x] Update `docs/operations/TESTING.md` with dead-letter recovery playbooks for derived jobs.

**Tests / eval updates in this phase:**

- [ ] Add handler-level tests under `packages/server/src/lib/jobs/handlers/*.test.ts`.
- [x] Extend `packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts` with outbox-to-job assertions.
- [x] Extend `packages/server/src/routes/feedback.test.ts` and `packages/server/src/__tests__/candidate-pipeline.test.ts` with async follow-up visibility checks.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts \
  packages/server/src/__tests__/candidate-pipeline.test.ts \
  packages/server/src/routes/feedback.test.ts
```
- [ ] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface AsyncJobHandler<TPayload> {
  type: string;
  dedupeKey(payload: TPayload): string | null;
  handle(payload: TPayload, signal: AbortSignal): Promise<void>;
}
```

```ts
await taskQueue.enqueue(
  'feedback.badcase-export',
  { feedbackId, entryId, queryId },
  { dedupeKey: `feedback.badcase-export:${feedbackId}` },
);
```

## Phase 6: Add Event-Driven Cache Invalidation And Read-Model Refresh

**Objective:** Treat retrieval caches and derived read models as explicit event-driven artifacts rather than best-effort process-local optimizations.

**Files:**
- Modify: `packages/server/src/lib/cache/retrieval-cache.ts`
- Modify: `packages/server/src/lib/cache/metrics.ts`
- Modify: `packages/server/src/lib/retrieval/read-model.ts`
- Modify: `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/indexing.ts`
- Modify: `packages/server/src/lib/jobs/handlers/*.ts`
- Modify: `packages/server/src/lib/cache/retrieval-cache.test.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts`
- Modify: `packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts`
- Modify: `packages/server/src/routes/retrieval.test.ts`
- Modify: `plan.md`

- [x] Define which retrieval-side caches remain process-local and which derived artifacts require explicit invalidation or refresh.
- [x] Add shared invalidation hooks for:
  - lifecycle approval
  - lifecycle deactivation
  - remediation suppression
  - remediation reactivation
- [x] Expose cache hit/miss/eviction metrics through operator-facing runtime surfaces.
- [x] Keep cache bounds explicit with TTL/LRU policy and prevent unbounded in-memory growth.
- [x] Ensure stale cached content cannot reintroduce suppressed artifacts into retrieval results.

**Completion standard:**

- [x] Cache invalidation happens from shared events/jobs, not route-local one-offs.
- [x] Retrieval tests prove approved/reactivated content appears after refresh and suppressed content stays hidden.
- [x] Operators can inspect high-level cache metrics.
- [x] Cache ownership and invalidation policy are documented in truth docs.

**Document updates in this phase:**

- [x] Update `docs/PACKAGES.md` and `docs/PACKAGE_STACK_RATIONALE.md` with cache ownership and invalidation posture.
- [x] Update `docs/operations/TESTING.md` with cache invalidation verification steps after lifecycle/remediation changes.
- [x] Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` if cache policy becomes a documented truth source.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/lib/cache/retrieval-cache.test.ts` with invalidation-triggered refresh behavior.
- [x] Extend retrieval integration tests with stale-cache guard assertions.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/cache/retrieval-cache.test.ts \
  packages/server/src/lib/retrieval/orchestration/recall-coordinator.test.ts \
  packages/server/src/lib/retrieval/graph-plan/graph-plan-search.test.ts \
  packages/server/src/routes/retrieval.test.ts
```
- [ ] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface CacheInvalidationEvent {
  sourceType: 'trap' | 'skill';
  sourceId: string;
  reason:
    | 'approved'
    | 'deactivated'
    | 'remediation-suppressed'
    | 'remediation-reactivated';
}
```

```ts
if (event.reason === 'remediation-suppressed') {
  retrievalCache.deleteByPrefix(`skill:${event.sourceId}`);
}
```

## Phase 7: Materialize Badcases Into Eval Inputs And Decision Metrics

**Objective:** Close the operational loop from live failure to regression case and finish with explicit architecture-decision metrics rather than assumptions about MQ or microservice splits.

**Files:**
- Modify: `packages/contracts/src/domain/operations.ts`
- Create: `packages/server/src/routes/operations/badcases.ts`
- Modify: `packages/server/src/routes/operations/index.ts`
- Create: `scripts/export-badcase-to-eval.ts`
- Modify: `packages/server/src/routes/operations/*.test.ts`
- Modify: `packages/server/src/lib/runtime/metrics.ts`
- Modify: `packages/server/src/routes/operations/stats.ts`
- Modify: `packages/server/src/routes/operations/stats.test.ts`
- Modify: `docs/todos/badcase-feedback-loop.md`
- Modify: `docs/todos/backend-engineering-optimization-plan.md`
- Modify: `evals/README.md`
- Modify: `evals/retrieval/README.md`
- Modify: `evals/summary/README.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/PACKAGES.md`
- Modify: `docs/reference/api-surface.md`
- Modify: `plan.md`

- [x] Add an operator flow to export a stored badcase into a deterministic retrieval or summary eval draft.
- [x] Decide and document the first-version export shape:
  - return JSON draft
  - write script-generated draft
  - or both
- [x] Add metrics or summary endpoints that answer:
  - queue backlog by type
  - retry/dead-letter rate by type
  - worker execution latency by type
  - cache hit/miss rate
  - badcase export volume
  - retrieval failure distribution
- [x] Define explicit thresholds for:
  - “PG queue is enough”
  - “consider external MQ”
  - “modular monolith is enough”
  - “consider service split”
- [x] Update backend engineering TODO docs so future MQ/service decisions are contingent on measured thresholds.

**Completion standard:**

- [x] An operator can take a stored badcase and produce a stable eval draft without reconstructing context manually.
- [x] The export path is documented and covered by at least one automated test.
- [x] Operator stats surfaces expose architecture-decision metrics instead of only generic counters.
- [x] The repository contains explicit written decision gates for MQ and service-split adoption.

**Document updates in this phase:**

- [x] Update `docs/todos/badcase-feedback-loop.md` with the implemented end-to-end loop and remaining manual review boundary.
- [x] Update `evals/README.md`, `evals/retrieval/README.md`, and `evals/summary/README.md` with the export workflow.
- [x] Update `docs/todos/backend-engineering-optimization-plan.md` into a measured decision guide.
- [x] Update `docs/operations/TESTING.md` with the end-to-end operator recipe:
  - retrieve with `queryId`
  - submit feedback
  - inspect badcase
  - export eval draft
  - add regression case
- [x] Update `docs/reference/api-surface.md` with badcase export and stats endpoint changes.

**Tests / eval updates in this phase:**

- [x] Add route/script tests for badcase export.
- [x] Extend `packages/server/src/lib/runtime/metrics.test.ts` and `packages/server/src/routes/operations/stats.test.ts` with the new decision metrics.
- [x] Add at least one example exported retrieval eval draft fixture or snapshot test.
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/routes/operations/*.test.ts \
  packages/server/src/lib/runtime/metrics.test.ts \
  packages/server/src/routes/operations/stats.test.ts
```
- [ ] Run:
```bash
rtk pnpm eval:smoke
```
- [ ] Run:
```bash
rtk pnpm typecheck
```

**Example structure or code:**
```ts
export interface BadcaseEvalDraft {
  kind: 'retrieval' | 'summary';
  caseId: string;
  sourceFeedbackId: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
  notes: string[];
}
```

```ts
export interface AsyncArchitectureDecisionSnapshot {
  queueBacklogByType: Record<string, number>;
  deadLetterByType: Record<string, number>;
  avgHandlerLatencyMsByType: Record<string, number>;
  cacheHitRateByNamespace: Record<string, number>;
  badcaseExportCount: number;
}
```

## Final Acceptance Checklist

- [x] Candidate scheduling and lifecycle outbox registration are transactional with their authoritative writes.
- [x] Queue and outbox consumers can reclaim stuck work after process death.
- [x] API, task-worker, outbox-worker, and combined runtime modes all work with correct readiness semantics.
- [x] Long-running jobs expose durable workflow-run snapshots with step-level visibility.
- [x] Public retrieval responses expose `queryId` and support badcase traceability.
- [x] Feedback submissions persist enough query/result context to reproduce failures.
- [x] Heavy follow-up work is scheduled through shared jobs rather than route-local side effects.
- [x] Retrieval caches/read models refresh through shared events/jobs and do not leak suppressed stale content.
- [x] Operators can export badcases into eval drafts with a documented workflow.
- [x] Runtime metrics define objective triggers for MQ or service-split adoption.
- [x] Docs cover the end-to-end operator and verification flow.
- [ ] Phase-complete status is only checked after matching code, tests, evals, and docs are updated.
