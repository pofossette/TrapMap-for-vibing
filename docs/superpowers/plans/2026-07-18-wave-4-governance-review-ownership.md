# Wave-4 Governance Review Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Move feedback, conflict, remediation, and operator projections to `governance-review`, make conflict detection a real consumable queued workflow, preserve distributed public behavior, and retire the Wave-4 compatibility shell.

**Architecture:** Shared task payloads and owner ports live in `contracts`/`backend-core`. `governance-review` implements conflict detection and operator APIs; `job-runtime` consumes typed handlers while retaining queue/retry/lease/dead-letter ownership. Host-local composition injects owner ports directly, while distributed composition uses internal HTTP adapters. Server lifecycle code only schedules through `JobRuntimePort`.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL, Drizzle/pool owner bundles, existing `TaskQueuePort`, `callInternalService()`, and the repository's Fallow/retirement guards.

## Global Constraints

- Work directly on `main`; preserve the six pre-existing unstaged formatting changes and never stage them.
- Every behavior follows RED → confirm RED → minimal GREEN → focused regression → tranche commit.
- Run shell commands directly with pnpm; every commit stages only files in its tranche.
- Do not import another service's concrete implementation; use `contracts`, `backend-core` ports, internal HTTP, or outbox delivery.
- Do not touch Wave-5+ ownership work or the `store_snapshot`/`JsonStore`/`PostgresStore` Wave-9 deletion scope.
- Do not remove the Wave-4 guard allowlist or add `wave-4` to `completedOwnerWaves` until the final closeout tranche.
- Required per-tranche checks are focused owner/gateway/host tests, `pnpm typecheck`, and `git diff --check`.

---

### Task 1: Define the conflict task and owner ports

**Files:**
- Modify: `packages/contracts/src/domain/async.ts`
- Modify: `packages/contracts/src/domain/async.test.ts`
- Modify: `packages/backend-core/src/ports/internal-ports.ts`
- Create: `packages/backend-core/src/ports/internal-ports.test.ts`
- Modify: `packages/backend-core/src/ports/queue-ports.ts` if the shared enqueue option is needed by the runtime adapter
- Modify: `packages/backend-core/src/ports/index.ts`
- Modify: `packages/backend-core/src/ports/index.d.ts` only if generated declarations are checked in by the package workflow

**Interfaces:**
- Produces `governanceConflictDetectionPayloadSchema`, `GovernanceConflictDetectionPayload`, and task type `governance.conflict-detection`.
- Produces `GovernanceConflictEntry`, `GovernanceConflictReadPort`, `GovernanceConflictWorkflowPort`, and `GovernanceRetrievalProjection` in `backend-core`.
- `GovernanceConflictReadPort.getApprovedConflictCandidates(entryId)` returns `null` for a missing/non-approved entry and otherwise returns the approved entry plus approved comparison entries.
- `GovernanceConflictWorkflowPort.detectConflicts(input)` returns `{ detectedCount: number }` and is idempotent under repeated delivery.
- `GovernanceRetrievalProjection.listFeedback()` and `listConflicts(entryIds)` provide read-only data to retrieval; mutation remains owner-local.

- [x] **Step 1: Write the failing contract tests.**

Add one async contract test that parses `{ entryId: 'entry-1', sourceEventId: 'event-1' }`, rejects an omitted `entryId`, and verifies the task registry describes owner `feedback-record`/`conflict-relation`, per-transition ordering, exponential retry, and dead-letter handling. Add a port test using `expectTypeOf` to require the workflow return shape and read projection methods.

```ts
const payload = governanceConflictDetectionPayloadSchema.parse({
  entryId: 'entry-1',
  sourceEventId: 'event-1',
});
expect(payload).toEqual({ entryId: 'entry-1', sourceEventId: 'event-1' });
expect(() => governanceConflictDetectionPayloadSchema.parse({ sourceEventId: 'event-1' })).toThrow();
```

- [x] **Step 2: Run the focused tests to confirm RED.**

Run `pnpm test:file -- packages/contracts/src/domain/async.test.ts packages/backend-core/src/ports/internal-ports.test.ts`. Expected: the new schema/task symbols and port types are missing; do not proceed on a passing test.

- [x] **Step 3: Implement the minimum shared contract.**

Add the task type to `asyncJobTaskTypeSchema` and `sharedJobPayloadSchemaMap`, define the strict payload schema, and add a `defineSharedJobContract` entry with `maxAttempts: 5`, exponential backoff, `per-transition` ordering, and `governance-review` as the downstream owner. Add the four structural port interfaces to `backend-core` and export them through the existing ports barrel. Do not add service imports.

- [x] **Step 4: Run the contract tests GREEN.**

Run the same focused test command and then `pnpm typecheck`. Expected: contract and port tests pass with no new boundary errors.

- [x] **Step 5: Commit the contract tranche.**

```bash
git add packages/contracts/src/domain/async.ts packages/contracts/src/domain/async.test.ts packages/backend-core/src/ports/internal-ports.ts packages/backend-core/src/ports/internal-ports.test.ts packages/backend-core/src/ports/index.ts
git commit -m "feat(governance): define conflict workflow contracts"
```

---

### Task 2: Implement governance conflict detection and its queue handler

**Files:**
- Create: `packages/service-governance-review/src/conflict-workflow.ts`
- Create: `packages/service-governance-review/src/conflict-workflow.test.ts`
- Modify: `packages/service-governance-review/src/pg-ports.ts`
- Modify: `packages/service-governance-review/src/index.ts`
- Create: `packages/service-job-runtime/src/handlers/governance-conflict.ts`
- Create: `packages/service-job-runtime/src/handlers/governance-conflict.test.ts`
- Modify: `packages/service-job-runtime/src/index.ts`

**Interfaces:**
- `createGovernanceConflictWorkflow({ read, projection, chat?, createId?, now? }): GovernanceConflictWorkflowPort`.
- `createGovernanceConflictTaskHandler(workflow): TaskHandler<GovernanceConflictDetectionPayload>`.
- The handler accepts only `governance.conflict-detection`, validates payload with the contracts schema, calls `workflow.detectConflicts`, and rethrows dependency errors.

- [x] **Step 1: Write RED tests for owner behavior.**

Test the workflow with two approved entries whose problem tokens overlap and solution tokens diverge; expect one canonical relation and one `projection.upsert` call. Add tests for missing/non-approved no-op, existing canonical pair skip, and duplicate task delivery. Test the task handler calls the workflow once for valid payload and propagates a rejected workflow promise.

```ts
const workflow = createGovernanceConflictWorkflow({ read, projection, now: () => '2026-07-18T00:00:00.000Z' });
await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({ detectedCount: 1 });
expect(projection.upsert).toHaveBeenCalledWith(expect.objectContaining({
  entryIdA: 'entry-old',
  entryIdB: 'entry-new',
  conflictType: 'contradictory',
}));
```

- [x] **Step 2: Run the owner and handler tests to confirm RED.**

Run `pnpm test:file -- packages/service-governance-review/src/conflict-workflow.test.ts packages/service-job-runtime/src/handlers/governance-conflict.test.ts`. Expected: the new factories are missing.

- [x] **Step 3: Implement the minimal owner workflow.**

Move the pure tokenization, overlap, classification, canonical ordering, and context generation behavior from `packages/server/src/lib/conflict/detect.ts` into the governance service without importing server types. Use a structural optional chat port local to the owner package; preserve deterministic fallback when chat is absent or returns no conflict. Read candidates through `GovernanceConflictReadPort`, allocate IDs in the owner factory, and call the existing owner-bundle `conflictProjection.upsert` once per new relation. Keep the existing thresholds and relation shape.

- [x] **Step 4: Implement the minimal queue handler.**

Parse the payload, invoke the workflow, and return normally for workflow no-op/results. Do not catch dependency failures, perform queue operations, or write a dead-letter record from the handler; those remain `job-runtime`/queue responsibilities.

- [x] **Step 5: Run GREEN and owner typechecks.**

Run `pnpm test:file -- packages/service-governance-review/src/conflict-workflow.test.ts packages/service-job-runtime/src/handlers/governance-conflict.test.ts packages/service-governance-review/src/pg-ports.test.ts`, `pnpm typecheck`, and `git diff --check`.

- [x] **Step 6: Commit the consumable workflow tranche.**

```bash
git add packages/service-governance-review/src/conflict-workflow.ts packages/service-governance-review/src/conflict-workflow.test.ts packages/service-governance-review/src/pg-ports.ts packages/service-governance-review/src/index.ts packages/service-job-runtime/src/handlers/governance-conflict.ts packages/service-job-runtime/src/handlers/governance-conflict.test.ts packages/service-job-runtime/src/index.ts
git commit -m "feat(governance): consume conflict detection workflow"
```

---

### Task 3: Give job-runtime consumer ownership and switch lifecycle scheduling

**Files:**
- Modify: `packages/service-job-runtime/src/deps.ts`
- Modify: `packages/service-job-runtime/src/server.ts`
- Modify: `packages/service-job-runtime/src/server.test.ts` or create it if absent
- Modify: `packages/host-distributed/src/job-runtime/server.ts`
- Modify: `packages/host-distributed/src/shared/ports.ts`
- Modify: `packages/host-distributed/src/shared/internal-governance-review-client.ts` or the existing internal-client seam
- Modify: `packages/backend-core/src/job-runtime/application/module.ts`
- Modify: `packages/server/src/lib/context.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/conflict.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-workers.ts`
- Modify: `packages/server/src/bootstrap/startup.test.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts`
- Modify: `packages/host-local/src/nest/runtime/backend-core-adapters.ts`
- Modify: `packages/host-local/src/nest/runtime/host-services.ts`

**Interfaces:**
- `JobRuntimePort.schedule` remains the only scheduling method used by the server subscriber.
- `JobRuntimePort.schedule` exposes `dedupeKey` through its shared scheduling options and forwards it to `TaskQueuePort.enqueue`.
- `JobRuntimePortDeps` accepts a typed `taskHandlers` list and `ownsWork`; `createJobRuntimeServer` creates the queue consumer through `TaskQueuePort.createConsumer` and stops it during `close()`.
- `SkillShareerServices.jobRuntime` is an injected `Pick<JobRuntimePort, 'schedule'>`; the subscriber cannot access the task transport directly.
- `createConflictSubscriber(jobRuntime)` schedules only approved events with payload `{ entryId, sourceEventId }` and a stable dedupe key.

- [x] **Step 1: Write RED tests for scheduling and consumer ownership.**

Test that an approved event calls `jobRuntime.schedule('governance.conflict-detection', { entryId: 'entry-1', sourceEventId: 'event-1' }, expect.objectContaining({ dedupeKey: 'governance.conflict-detection:entry-1:event-1' }))`, while a rejected event does not call it. Test the job-runtime server passes the handler to `createConsumer`, starts it only when `ownsWork` is true, and awaits `stop()` on close. Test a handler rejection is not swallowed by the consumer adapter.

- [x] **Step 2: Run focused tests to confirm RED.**

Run `pnpm test:file -- packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts packages/service-job-runtime/src/server.test.ts packages/server/src/bootstrap/startup.test.ts`. Expected: the subscriber still reads the store and job-runtime server has no consumer wiring.

- [x] **Step 3: Add injected job-runtime and handler wiring.**

Add the injected schedule port to server context/build options, construct the host-local job-runtime port from the owner queue ports, and combine the governance conflict handler with existing handlers only where the host owns shared task work. Make `bootstrap-workers` receive handler contributions instead of constructing governance behavior itself. Preserve existing worker health and shutdown semantics.

- [x] **Step 4: Replace the subscriber implementation.**

Remove the `store.snapshot()` and `detectConflicts()` call. Schedule the typed task and pass the scheduling error through unchanged so the domain outbox can retry. Do not add a fallback to direct detection.

- [x] **Step 5: Wire distributed job-runtime to governance internal HTTP.**

Add a remote `GovernanceConflictWorkflowPort` adapter using `callInternalService()` conventions and the configured governance URL. Extend the distributed PostgreSQL task port with the existing reliable consumer behavior or adapt the existing queue implementation without changing lease/retry/dead-letter SQL semantics. Register the conflict handler in the job-runtime service, not in the gateway.

- [x] **Step 6: Run GREEN validation and commit.**

Run `pnpm test:file -- packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts packages/server/src/bootstrap/startup.test.ts packages/service-job-runtime/src/server.test.ts packages/host-local/src/nest/runtime/host-services.test.ts packages/host-distributed/src/job-runtime/ownership-acceptance.test.ts`, then `pnpm typecheck` and `git diff --check`.

```bash
git add packages/service-job-runtime/src/deps.ts packages/service-job-runtime/src/server.ts packages/service-job-runtime/src/server.test.ts packages/host-distributed/src/job-runtime/server.ts packages/host-distributed/src/shared/ports.ts packages/host-distributed/src/shared/internal-governance-review-client.ts packages/backend-core/src/job-runtime/application/module.ts packages/server/src/lib/context.ts packages/server/src/app.ts packages/server/src/lib/lifecycle/subscribers/conflict.ts packages/server/src/bootstrap/bootstrap-lifecycle.ts packages/server/src/bootstrap/bootstrap-workers.ts packages/server/src/bootstrap/startup.test.ts packages/server/src/lib/lifecycle/subscribers/subscribers.test.ts packages/host-local/src/nest/runtime/backend-core-adapters.ts packages/host-local/src/nest/runtime/host-services.ts
git commit -m "refactor(runtime): schedule governance conflict work"
```

---

### Task 4: Move feedback admin/remediation APIs into governance-review

**Files:**
- Modify: `packages/backend-core/src/ports/internal-ports.ts`
- Modify: `packages/backend-core/src/ports/repo-ports.ts`
- Create: `packages/service-governance-review/src/admin.ts`
- Create: `packages/service-governance-review/src/admin.test.ts`
- Modify: `packages/service-governance-review/src/application/module.ts`
- Modify: `packages/service-governance-review/src/deps.ts`
- Modify: `packages/service-governance-review/src/routes.ts`
- Modify: `packages/service-governance-review/src/routes.test.ts`
- Modify: `packages/service-governance-review/src/server.ts`
- Modify: `packages/host-distributed/src/governance-review/ports.ts`
- Modify: `packages/host-distributed/src/governance-review/server.ts`
- Modify: `packages/host-local/src/nest/app.module.ts`

**Interfaces:**
- Add `GovernanceReviewAdminPort` for list, batch, stats, remediation queue/detail, and remediation completion operations.
- The owner module receives `feedbackRepo`, knowledge/artifact read projections, `KnowledgeWritePort`, `JobRuntimePort`, and `AuditLogPort` through ports only.
- Internal route paths are `/internal/feedback/admin`, `/internal/feedback/admin/batch`, `/internal/feedback/admin/stats/:entryId`, `/internal/feedback/admin/remediation`, `/internal/feedback/admin/remediation/:entryId`, and `/internal/feedback/admin/remediation/:entryId/complete`.

- [x] **Step 1: Write RED admin behavior tests.**

Port the existing schema-driven behavior into owner tests: filters and descending submission order for list; dry-run eligibility and batch update semantics; 404 for missing stats entry; quality score/recent feedback; remediation threshold conflict; completion updates unresolved feedback and schedules `feedback.remediation-reactivation` through `JobRuntimePort`.

- [x] **Step 2: Run owner admin tests to confirm RED.**

Run `pnpm test:file -- packages/service-governance-review/src/admin.test.ts packages/service-governance-review/src/routes.test.ts`. Expected: admin port/factory/routes do not exist.

- [x] **Step 3: Implement owner admin module and internal routes.**

Move the pure calculations from server feedback-admin helpers into the governance package, keep contract schemas as the validation source, inject entry display/remediation reads, and record audit events through `AuditLogPort`. Replace server shared-job scheduling with `JobRuntimePort.schedule` and preserve the existing response schemas/fields.

- [x] **Step 4: Add owner route RED/GREEN coverage.**

Register the six internal paths, assert actor extraction from `x-trapmap-actor-id`, reject body actor spoofing with `403`, map `InvocationError` to the existing status/body shape, and assert each route delegates to the admin port with query/path/body values intact.

- [x] **Step 5: Wire host-local and distributed owner dependencies.**

Host-local injects the governance PG bundle, knowledge/artifact projections, local knowledge-write port, local job-runtime port, and audit port. Distributed uses the existing remote knowledge-write and knowledge-read adapters plus the owner PG feedback/conflict bundle and remote job-runtime scheduler. No gateway route code is imported by the service.

- [x] **Step 6: Run GREEN and commit the owner API tranche.**

Run `pnpm test:file -- packages/service-governance-review/src/admin.test.ts packages/service-governance-review/src/routes.test.ts packages/service-governance-review/src/pg-ports.test.ts packages/host-distributed/src/governance-review/routes.test.ts packages/host-distributed/src/governance-review/delegation-acceptance.test.ts`, then `pnpm typecheck` and `git diff --check`.

```bash
git add packages/backend-core/src/ports/internal-ports.ts packages/backend-core/src/ports/repo-ports.ts packages/service-governance-review/src/admin.ts packages/service-governance-review/src/admin.test.ts packages/service-governance-review/src/application/module.ts packages/service-governance-review/src/deps.ts packages/service-governance-review/src/routes.ts packages/service-governance-review/src/routes.test.ts packages/service-governance-review/src/server.ts packages/host-distributed/src/governance-review/ports.ts packages/host-distributed/src/governance-review/server.ts packages/host-local/src/nest/app.module.ts
git commit -m "feat(governance): expose feedback admin owner APIs"
```

---

### Task 5: Preserve public gateway URLs and inject owner projections into reads

**Files:**
- Modify: `packages/host-distributed/src/gateway/internal-client.ts`
- Modify: `packages/host-distributed/src/gateway/routes.ts`
- Modify: `packages/host-distributed/src/gateway/routes.test.ts`
- Modify: `packages/host-distributed/src/gateway/internal-client.test.ts`
- Modify: `packages/host-distributed/src/shared/internal-governance-review-client.ts`
- Modify: `packages/backend-core/src/ports/internal-ports.ts`
- Modify: `packages/service-knowledge-read/src/deps.ts`
- Modify: `packages/service-knowledge-read/src/routes.ts`
- Modify: `packages/service-knowledge-read/src/routes.test.ts`
- Modify: `packages/service-knowledge-read/src/read-model.ts`
- Modify: `packages/host-distributed/src/knowledge-read/index.ts`
- Modify: `packages/host-local/src/nest/runtime/host-services.ts`
- Modify: `packages/host-local/src/nest/app.module.ts`
- Modify: `packages/server/src/lib/context.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/lib/retrieval/read-model.ts`
- Modify: `packages/server/src/lib/retrieval/orchestration/search-v1.ts`
- Modify: `packages/server/src/lib/retrieval/__fixtures__/graph-fixtures.ts`

**Interfaces:**
- Add gateway client methods for the six existing public feedback-admin URLs, each accepting `InternalRequestOptions`.
- Add gateway handlers that use trusted authenticated actor resolution and `forwardResponse`; no new public path is introduced.
- Add a read-only governance projection adapter for knowledge-read/server retrieval; conflict enrichment calls `enrichConflictHints` from `@trapmap/contracts`.

- [x] **Step 1: Write RED gateway and projection tests.**

Assert all six public URLs call the governance client with exact path/query/body and forwarded trace/correlation/actor headers. Assert gateway preserves owner status and canonical error bodies. Assert knowledge-read/server retrieval receives conflict relations and remediation projections through injected ports without importing `@trapmap/server/lib/conflict` or reading `repos.feedback`/`repos.conflict`.

- [x] **Step 2: Run focused tests to confirm RED.**

Run `pnpm test:file -- packages/host-distributed/src/gateway/routes.test.ts packages/host-distributed/src/gateway/internal-client.test.ts packages/service-knowledge-read/src/routes.test.ts packages/server/src/lib/retrieval/orchestration/search-v1.test.ts`. Expected: admin client methods/routes and injected projection seams are missing.

- [x] **Step 3: Implement gateway forwarding.**

Use `callInternalService()` with the governance-review service URL, preserve query strings and request bodies, pass `trustedActorOptions(request)`, and return `forwardResponse` directly. Keep existing upstream-unavailable messages and all existing `/v1/feedback` behavior.

- [x] **Step 4: Implement read projection injection.**

Replace runtime-infra conflict/feedback repository reads in both retrieval paths with injected `GovernanceRetrievalProjection` calls. Add the knowledge-read internal projection request needed by distributed governance/read composition and a host-local direct adapter. Keep remediation attachment and conflict hint filtering behavior unchanged.

- [x] **Step 5: Run GREEN and commit the compatibility-preserving tranche.**

Run `pnpm test:file -- packages/host-distributed/src/gateway/routes.test.ts packages/host-distributed/src/gateway/internal-client.test.ts packages/host-distributed/src/gateway/distributed-acceptance.test.ts packages/service-knowledge-read/src/routes.test.ts packages/service-knowledge-read/src/read-model.test.ts packages/server/src/lib/retrieval/orchestration/search-v1.test.ts`, then `pnpm typecheck` and `git diff --check`.

```bash
git add packages/host-distributed/src/gateway/internal-client.ts packages/host-distributed/src/gateway/routes.ts packages/host-distributed/src/gateway/routes.test.ts packages/host-distributed/src/gateway/internal-client.test.ts packages/host-distributed/src/shared/internal-governance-review-client.ts packages/backend-core/src/ports/internal-ports.ts packages/service-knowledge-read/src/deps.ts packages/service-knowledge-read/src/routes.ts packages/service-knowledge-read/src/routes.test.ts packages/service-knowledge-read/src/read-model.ts packages/host-distributed/src/knowledge-read/index.ts packages/host-local/src/nest/runtime/host-services.ts packages/host-local/src/nest/app.module.ts packages/server/src/lib/context.ts packages/server/src/app.ts packages/server/src/lib/retrieval/read-model.ts packages/server/src/lib/retrieval/orchestration/search-v1.ts packages/server/src/lib/retrieval/__fixtures__/graph-fixtures.ts
git commit -m "feat(gateway): forward governance feedback operations"
```

---

### Task 6: Delete Wave-4 compatibility implementations and badcase shell

**Files:**
- Delete: `packages/server/src/routes/feedback.ts`
- Delete: `packages/server/src/routes/feedback-admin.ts`
- Delete: `packages/server/src/routes/feedback-admin/feedback-list.ts`
- Delete: `packages/server/src/routes/feedback-admin/feedback-batch.ts`
- Delete: `packages/server/src/routes/feedback-admin/feedback-stats.ts`
- Delete: `packages/server/src/routes/feedback-admin/remediation.ts`
- Delete: `packages/server/src/routes/feedback-admin/helpers.ts`
- Delete: `packages/server/src/routes/feedback-admin/index.ts`
- Delete: `packages/server/src/lib/feedback/repository.ts`
- Delete: `packages/server/src/lib/feedback/pg-repository.ts`
- Delete: `packages/server/src/lib/feedback/index.ts`
- Delete: `packages/server/src/lib/feedback/remediation.ts`
- Delete: `packages/server/src/lib/feedback/lifecycle-triggers.ts`
- Delete: `packages/server/src/lib/conflict/detect.ts`
- Delete: `packages/server/src/lib/conflict/detect.test.ts`
- Delete: `packages/server/src/lib/conflict/enrich.ts`
- Delete: `packages/server/src/lib/conflict/enrich.test.ts`
- Delete: `packages/server/src/lib/conflict/llm-conflict.ts`
- Delete: `packages/server/src/lib/conflict/llm-conflict.test.ts`
- Delete: `packages/server/src/lib/conflict/repository.ts`
- Delete: `packages/server/src/lib/conflict/index.ts`
- Modify: `packages/server/src/routes/register-capability-routes.ts`
- Modify: `packages/server/src/lib/repos/index.ts`
- Modify: `packages/runtime-infra/src/repos.ts`
- Modify: `packages/runtime-infra/src/shared-infra.ts`
- Modify: `packages/server/src/lib/jobs/index.ts`
- Delete: `packages/server/src/lib/jobs/handlers/remediation-reactivation.ts`
- Delete: `packages/server/src/lib/jobs/handlers/badcase-export-draft.ts`
- Modify: `scripts/export-badcase-to-eval.ts`
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts` only to remove Wave-4 entries after all production hits disappear

- [x] **Step 1: Write RED deletion/boundary tests.**

Extend the server/runtime aggregate tests to assert `SkillShareerRepos` has no `feedback` or `conflict` keys, capability registration does not register feedback routes, and production TypeScript contains no imports of deleted server modules. Add a script test proving badcase export uses the governance owner boundary rather than `@trapmap/server`.

- [x] **Step 2: Run the guard/deletion tests to confirm RED.**

Run `pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts packages/runtime-infra/src/shared-infra.test.ts packages/server/src/lib/__tests__/types-export.test.ts`. Expected: current aggregate and route imports fail the new assertions.

- [x] **Step 3: Remove registrations and compatibility implementations.**

Delete the listed server modules only after their behavior is covered by governance tests and gateway/read projection tests. Remove feedback/conflict members from both repository aggregates and update all call sites to the injected governance projection. Remove server remediation/badcase task handlers; do not remove shared contracts needed by governance owner workers.

- [x] **Step 4: Remove the Wave-4 production guard entries.**

After the production scan reports no Wave-4 compatibility hits, remove only the entries for `packages/server/src/lib/feedback/pg-repository.ts:store_snapshot` and `scripts/export-badcase-to-eval.ts:@trapmap/server`. Leave every Wave-5+ and Wave-9 entry untouched. Keep `completedOwnerWaves` unchanged until Task 7.

- [x] **Step 5: Run GREEN boundary validation and commit.**

Run `pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts packages/runtime-infra/src/shared-infra.test.ts packages/server/src/lib/__tests__/types-export.test.ts packages/service-knowledge-read/src/import-boundary.test.ts`, `pnpm typecheck`, and `git diff --check`.

```bash
git add packages/server/src/routes/register-capability-routes.ts packages/server/src/lib/repos/index.ts packages/runtime-infra/src/repos.ts packages/runtime-infra/src/shared-infra.ts packages/server/src/lib/jobs/index.ts packages/server/src/lib/jobs/handlers packages/server/src/routes/feedback.ts packages/server/src/routes/feedback-admin.ts packages/server/src/routes/feedback-admin packages/server/src/lib/feedback packages/server/src/lib/conflict scripts/export-badcase-to-eval.ts scripts/__tests__/compatibility-retirement-guard.test.ts
git commit -m "refactor(governance): delete wave-4 compatibility shell"
```

---

### Task 7: Close Wave-4 evidence and update active documentation

**Files:**
- Modify: `scripts/__tests__/compatibility-retirement-guard.test.ts`
- Modify: `docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md`
- Modify: `docs/reference/REPO_STRUCTURE.md` or the applicable ownership reference if the active docs require the new owner surface
- Modify: `docs/architecture/components/GOVERNANCE.md` or the applicable governance architecture page
- Modify: `docs/architecture/components/FEEDBACK.md`, `docs/reference/api-surface.md`, `docs/reference/GLOSSARY.md`, and `docs/PACKAGES.md`
- Modify: `docs/architecture/components/ASYNC_INFRASTRUCTURE.md`, `docs/architecture/components/ASYNC_MODEL.md`, and `docs/architecture/components/ASYNC_SHARED_JOB_CONTRACTS.md`
- Modify: `packages/server/src/lib/README.md`
- Modify: `docs/superpowers/plans/2026-07-18-wave-4-governance-review-ownership.md` to mark execution evidence complete

- [x] **Step 1: Write the closeout RED assertion.**

Add a focused guard test that expects `completedOwnerWaves` to include `wave-4` only when the production scan is empty for Wave-4. Run it before changing the list; it must fail against the current `['wave-1', 'wave-2', 'wave-3']` state.

- [x] **Step 2: Run the complete closeout evidence.**

Run, without filtering output through `head`, `tail`, or `grep`: `pnpm test:file -- scripts/__tests__/compatibility-retirement-guard.test.ts`, `pnpm eval:smoke`, `pnpm test:deployment-smoke`, `pnpm check:docs-drift`, `pnpm check:structure`, `pnpm exec fallow audit --base main --gate new-only --format json --quiet --explain`, `pnpm typecheck`, and `git diff --check`. Treat missing dependencies, failed startup, unavailable databases, or partial smoke output as failed validation, not success.

- [x] **Step 3: Update the completion markers only after all checks pass.**

Add `wave-4` to `completedOwnerWaves`, remove all Wave-4 allowlist entries, and record the exact focused/full commands and results in the active detail. Do not modify Wave-5+ or Wave-9 entries.

- [x] **Step 4: Commit the closeout tranche.**

```bash
git add scripts/__tests__/compatibility-retirement-guard.test.ts docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md docs/reference/REPO_STRUCTURE.md docs/architecture/components/GOVERNANCE.md docs/superpowers/plans/2026-07-18-wave-4-governance-review-ownership.md
git commit -m "docs(governance): close wave-4 ownership"
```

After this commit, run `git status --short` and verify the only remaining unstaged changes are the pre-existing formatting files.
