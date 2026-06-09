# Runtime Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build first-class production runtime foundations for TrapMap by standardizing online observability and making reliability patterns explicit, reusable infrastructure instead of route-local ad hoc behavior.

**Architecture:** Treat this as a backend hardening project layered on top of the current Fastify + PostgreSQL-first architecture. Phase 1 converges the online runtime surface around request context, structured logs, and machine-readable health/readiness/runtime signals. Phase 2 introduces a shared resilience layer for timeout, retry, degrade/fallback, and external dependency execution. Phase 3 applies explicit reliability policies to queue, lifecycle, and write-path workflows, then closes the loop with docs, tests, and eval-facing operational evidence.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL/Drizzle, existing task queue + outbox infrastructure, existing docs/guardrail scripts.

---

## Archive Note

- [x] Previous root plan archived to `docs/archived/archived-plans/plan-2026-06-09-root-wiring-debt-convergence-archived.md`
- [x] Active tracking file remains `plan.md`

## Scope

- [ ] Runtime observability baseline
- [ ] Structured request context and logs
- [ ] Runtime metrics and operational status surface
- [ ] Shared timeout / retry / degradation primitives
- [ ] Queue / lifecycle reliability policy convergence
- [ ] Documentation, CI, and eval closure

## Non-Goals

- [ ] Do not redesign retrieval ranking algorithms in this plan.
- [ ] Do not replace Fastify, Vitest, Drizzle, or the current queue/outbox architecture.
- [ ] Do not introduce a full external telemetry vendor dependency unless a later implementation task proves the current local-first approach insufficient.

## Confirmed Current Baseline

> **Code and doc evidence recorded 2026-06-09 before implementation changes.**

- [x] The server already exposes `/health`, `/ready`, and `/meta/routes`, but they are still mostly point-in-time JSON views rather than a broader runtime contract.
  - **Evidence:** `packages/server/src/app.ts`
- [x] The app has Fastify logging enabled outside tests, but there is no explicit shared request-context layer for request id / trace id / route-level enrichment.
  - **Evidence:** `packages/server/src/app.ts`, no dedicated runtime context module found under `packages/server/src/lib/`
- [x] There are environment variables for rate limiting and log toggles, but no central production-runtime document that ties logging, readiness, queue state, degradation, and retry policy together.
  - **Evidence:** `docs/operations/ENVIRONMENT.md`
- [x] Queue, outbox, candidate processing, and graph/query fallback behaviors already exist, but reliability rules are spread across modules and docs rather than expressed through one shared resilience seam.
  - **Evidence:** `packages/server/src/lib/queue/task-queue.ts`, `packages/server/src/lib/lifecycle/outbox.ts`, `packages/server/src/lib/candidates/processor.ts`, `packages/server/src/bootstrap/bootstrap-repositories.ts`
- [x] CI already runs typecheck, lint/check, unit/integration tests, docs drift, and complexity guards, but it does not yet advertise a dedicated runtime-foundations verification lane.
  - **Evidence:** `.github/workflows/ci.yml`, `docs/operations/CI_CD.md`

## Execution Rules

- [ ] Do not mark a phase complete until code, docs, tests, and any required eval/operational verification for that phase are all updated.
- [ ] Prefer additive runtime seams over route-by-route copy-paste logic.
- [ ] Any new reliability policy must be explicit about scope: which dependency, which timeout, which retry count, which fallback, and what gets logged or surfaced to operators.
- [ ] Any fallback/degraded path introduced or formalized in this project must emit a machine-readable signal and a test assertion.
- [ ] Any runtime metric or health/readiness field added in code must be documented in the relevant operations or deployment doc during the same phase.

## File Structure

### Runtime surface and request context

- `packages/server/src/app.ts`
  - server composition root, route registration, `/health`, `/ready`, `/meta/routes`
- `packages/server/src/config.ts`
  - runtime env parsing and defaults
- `packages/server/src/lib/errors.ts`
  - application error model and HTTP mapping
- `packages/server/src/lib/runtime/`
  - new shared runtime foundation modules for request context, logging helpers, metrics snapshotting, resilience primitives
- `packages/server/src/app.test.ts`
  - server-level runtime route and shutdown assertions

### Reliability and external dependency execution

- `packages/server/src/lib/candidates/processor.ts`
  - retry and queue handoff behavior
- `packages/server/src/lib/queue/task-queue.ts`
  - persistent queue semantics, dedupe, attempts, delay, dead-letter state
- `packages/server/src/lib/lifecycle/outbox.ts`
  - durable event delivery substrate
- `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
  - outbox worker bootstrapping and worker lifecycle
- `packages/server/src/bootstrap/bootstrap-repositories.ts`
  - graph backend bootstrap and current fail-open behavior
- `packages/server/src/lib/ai/provider-config.ts`
  - AI/runtime dependency config source

### Tests, docs, and operator workflows

- `docs/operations/ENVIRONMENT.md`
  - runtime env vars and production configuration
- `docs/operations/TESTING.md`
  - runtime verification commands and test matrix
- `docs/operations/CI_CD.md`
  - CI jobs and guardrails
- `docs/architecture/DEPLOYMENT.md`
  - runtime endpoints and deployment-facing behavior
- `docs/architecture/ARCHITECTURE.md`
  - startup/runtime composition
- `docs/reference/api-surface.md`
  - health/readiness/runtime endpoint contract if expanded

## Phase 1: Standardize Online Runtime Surface

**Objective:** Turn request context, health/readiness, and structured runtime signals into a stable online contract.

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/lib/errors.ts`
- Create: `packages/server/src/lib/runtime/request-context.ts`
- Create: `packages/server/src/lib/runtime/runtime-metadata.ts`
- Create: `packages/server/src/lib/runtime/runtime-metadata.test.ts`
- Modify: `packages/server/src/app.test.ts`

- [x] Audit the current `/health` and `/ready` payloads and write a short baseline note at the top of this phase before changing behavior.
  - Baseline recorded from `packages/server/src/app.ts` before edits: `/health` returned `{ status, product, packages, graphQuery, memory, uptimeSeconds }`; `/ready` returned `{ ok, queueWorkerRunning, database, graphQuery }`; neither route exposed a shared runtime snapshot or request-context contract.
- [x] Add a shared request-context seam that produces a stable `requestId`, carries optional upstream trace headers, and makes route/method metadata available to downstream logging and error handling.
- [x] Extend the runtime route surface so `/health` and `/ready` distinguish liveness, readiness, dependency mode, and degraded/fallback state in a machine-readable way.
- [x] Add one runtime metadata builder module rather than constructing response payloads inline in `app.ts`.
- [x] Ensure application errors include request context in server logs without leaking internal stack details to client JSON.

**Completion standard:**

- [x] Every incoming request has a stable request identifier available to handlers and error logging.
- [x] `/health` answers "is the process alive?" and `/ready` answers "can this instance serve traffic?" with explicit dependency/runtime mode fields.
- [x] Runtime fallback/degraded states already present in the system can be represented consistently in health/readiness output.
- [x] `app.ts` becomes thinner by delegating runtime payload construction to a dedicated module.

**Document updates in this phase:**

- [x] Update `docs/architecture/DEPLOYMENT.md` with the exact `/health` and `/ready` response contract and intended operator interpretation.
- [x] Update `docs/architecture/ARCHITECTURE.md` startup/runtime section to mention the request-context and runtime metadata seam.
- [x] Update `docs/reference/api-surface.md` if any runtime endpoint fields become contractual.

**Tests / eval updates in this phase:**

- [x] Extend `packages/server/src/app.test.ts` with assertions for request id presence, runtime mode fields, and degraded readiness cases.
- [x] Add `packages/server/src/lib/runtime/runtime-metadata.test.ts` covering process-alive, queue worker stopped, graph fallback active, and JSON-store vs PostgreSQL modes.
- [x] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/app.test.ts \
  packages/server/src/lib/runtime/runtime-metadata.test.ts \
  packages/server/src/config.test.ts
```
  - Result: pass; the workspace `test` script expanded to the full Vitest suite, and the full suite passed (`257` files passed, `7` skipped)
- [ ] Run:
- [x] Run:
```bash
rtk pnpm typecheck
```
  - Result: `TypeScript: No errors found`

**Review closure in this phase:**

- [x] Spec-compliance review closed after补齐 baseline note、`typecheck` 证据、degraded/liveness 测试覆盖、以及 runtime 文档示例与字段契约对齐。
- [x] Code-quality review closed after：
  - 将 `/ready` 在 `readiness === "not-ready"` 时改为返回 HTTP `503`
  - 清理重复的 `AppError` 分支
  - 补充 request-context 生成、自定义 header、error-path logging 的测试
  - 在文档中明确 Phase 1 readiness snapshot 只覆盖当前已观测依赖，而不是完整后台健康总表

**Example structure or code:**
```ts
export interface RuntimeStatusSnapshot {
  liveness: 'alive';
  readiness: 'ready' | 'degraded' | 'not-ready';
  requestContext: {
    requestIdHeader: string;
    traceHeader: string | null;
  };
  dependencies: {
    database: 'postgres' | 'json-store';
    queueWorker: 'running' | 'stopped';
    graphQuery: 'disabled' | 'healthy' | 'fallback' | 'failed';
  };
}
```

```ts
export function getOrCreateRequestContext(request: FastifyRequest) {
  const requestId = request.headers['x-request-id']?.toString() ?? randomUUID();
  const traceparent = request.headers.traceparent?.toString() ?? null;
  return { requestId, traceparent, method: request.method, route: request.url };
}
```

## Phase 2: Introduce Shared Resilience Primitives

**Objective:** Make timeout, retry, and degraded/fallback behavior a reusable infrastructure layer instead of scattered inline logic.

**Files:**
- Create: `packages/server/src/lib/runtime/resilience.ts`
- Create: `packages/server/src/lib/runtime/resilience.test.ts`
- Create: `packages/server/src/lib/runtime/metrics.ts`
- Create: `packages/server/src/lib/runtime/metrics.test.ts`
- Modify: `packages/server/src/lib/errors.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-repositories.ts`
- Modify: `packages/server/src/lib/candidates/processor.ts`
- Modify: `packages/server/src/lib/ai/provider-config.ts`
- Modify: `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`

- [ ] Define one shared resilience policy shape that captures `timeoutMs`, `maxAttempts`, `backoff`, `fallbackMode`, and `dependencyName`.
- [ ] Implement a small execution wrapper for dependency calls that records attempts, classifies timeout vs retryable vs permanent failure, and returns an explicit degraded/fallback result when configured to fail open.
- [ ] Move at least two existing ad hoc reliability behaviors onto the new primitive:
  - graph backend health/bootstrap fail-open handling
  - candidate processing retry/backoff or another existing worker-style retry path
- [ ] Add runtime metrics counters/snapshots for retries, timeouts, degraded executions, and fallback activations.
- [ ] Ensure resilience events can be logged with request/work item identifiers rather than plain `console.error`.

**Completion standard:**

- [ ] There is one shared resilience module used by multiple subsystems.
- [ ] At least one request-path dependency and one background-path dependency use the same timeout/retry/degrade abstraction.
- [ ] Runtime metrics can answer "how often are we retrying/falling back/timing out?" even before integrating a full Prometheus exporter.
- [ ] Inline reliability decisions in touched modules are replaced with explicit policy objects.

**Document updates in this phase:**

- [ ] Update `docs/operations/ENVIRONMENT.md` with any new resilience-related env vars and defaults.
- [ ] Update `docs/architecture/ARCHITECTURE.md` to show the runtime resilience layer between routes/workers and external dependencies.
- [ ] Update `docs/operations/TESTING.md` with a dedicated "runtime resilience" verification subsection.

**Tests / eval updates in this phase:**

- [ ] Add `packages/server/src/lib/runtime/resilience.test.ts` covering:
  - timeout without retry
  - retry then success
  - retry exhaustion
  - fail-open fallback with degraded result
- [ ] Add `packages/server/src/lib/runtime/metrics.test.ts` covering retry/degraded counter increments and snapshot reset behavior if supported.
- [ ] Update existing tests that currently assume inline retry/fallback behavior:
  - `packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts`
  - `packages/server/src/lib/candidates/processor.test.ts`
  - `packages/server/src/bootstrap/startup.test.ts`
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/runtime/resilience.test.ts \
  packages/server/src/lib/runtime/metrics.test.ts \
  packages/server/src/lib/candidates/processor.test.ts \
  packages/server/src/bootstrap/startup.test.ts \
  packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts
```
  - Expected: all pass

**Example structure or code:**
```ts
export interface ResiliencePolicy {
  dependencyName: string;
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  fallbackMode: 'fail-closed' | 'fail-open';
}

export interface ResilienceResult<T> {
  ok: boolean;
  value?: T;
  degraded: boolean;
  attempts: number;
  failureKind?: 'timeout' | 'retryable' | 'permanent';
}
```

```ts
const result = await executeWithResilience(
  graphHealthPolicy,
  async () => graphBackend.healthcheck(),
  runtimeContext,
);

if (!result.ok && graphHealthPolicy.fallbackMode === 'fail-closed') {
  throw new AppError('Graph backend healthcheck failed', 503, 'DEPENDENCY_UNAVAILABLE');
}
```

## Phase 3: Converge Queue And Lifecycle Reliability Policies

**Objective:** Apply explicit reliability rules to async workflows so retries, dead-lettering, idempotency, and operator-visible failure states are deliberate and inspectable.

**Files:**
- Modify: `packages/server/src/lib/queue/task-queue.ts`
- Modify: `packages/server/src/lib/queue/task-queue.test.ts`
- Modify: `packages/server/src/lib/lifecycle/outbox.ts`
- Modify: `packages/server/src/lib/lifecycle/outbox.test.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/src/lib/candidates/processor.ts`
- Modify: `packages/server/src/__tests__/candidate-pipeline.test.ts`
- Modify: `packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
- Modify: `packages/server/src/routes/candidates.test.ts`

- [ ] Define explicit retry/dead-letter policy constants or config for queue jobs and outbox worker consumption rather than leaving policy implicit in each caller.
- [ ] Standardize what metadata is preserved on failure:
  - request/work item id
  - attempt count
  - last error class
  - next retry / terminal state
- [ ] Ensure queue and outbox failure paths emit runtime metrics and structured logs through the new runtime foundation rather than raw console logging.
- [ ] Review existing idempotency expectations in candidate submission and queue dedupe, then formalize which transitions are safe to replay and which must hard-stop.
- [ ] Add or expose one operator-visible inspection surface for backlog/dead-letter/degraded worker state if the current `/ready` and internal routes are not sufficient.

**Completion standard:**

- [ ] Queue and outbox workers share an explicit, documented retry/dead-letter vocabulary.
- [ ] Failures in background processing are observable through tests and machine-readable status, not just log text.
- [ ] Candidate processing and lifecycle delivery no longer rely on hidden policy embedded in route/service internals.
- [ ] At least one operator-facing surface can answer whether async processing is healthy, degraded, backlogged, or dead-lettering.

**Document updates in this phase:**

- [ ] Update `docs/operations/TESTING.md` queue/outbox sections with the new reliability policy and verification commands.
- [ ] Update `docs/operations/CI_CD.md` if a new runtime/reliability test lane is added.
- [ ] Update `docs/operations/ENVIRONMENT.md` if retry or worker-tuning env vars are introduced.
- [ ] Update `docs/architecture/DEPLOYMENT.md` with operator guidance for interpreting degraded worker/runtime states.

**Tests / eval updates in this phase:**

- [ ] Extend `packages/server/src/lib/queue/task-queue.test.ts` for explicit retry-policy and dead-letter assertions.
- [ ] Extend `packages/server/src/lib/lifecycle/outbox.test.ts` for retry exhaustion, failure classification, and metrics/log emission behavior.
- [ ] Extend:
  - `packages/server/src/__tests__/candidate-pipeline.test.ts`
  - `packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
  - `packages/server/src/routes/candidates.test.ts`
- [ ] Run:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/queue/task-queue.test.ts \
  packages/server/src/lib/lifecycle/outbox.test.ts \
  packages/server/src/__tests__/candidate-pipeline.test.ts \
  packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts \
  packages/server/src/routes/candidates.test.ts
```
  - Expected: all pass
- [ ] Run PostgreSQL-backed verification subset:
```bash
rtk pnpm test -- --run \
  packages/server/src/lib/queue/task-queue.test.ts \
  packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts
```
  - Expected: all pass against PG-backed CI/local Docker environment

**Example structure or code:**
```ts
export interface WorkerReliabilityPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  deadLetterAfterMaxAttempts: boolean;
}
```

```ts
runtimeMetrics.recordWorkerFailure({
  worker: 'outbox',
  eventType: event.type,
  attempts: event.attempts,
  terminal: event.attempts >= policy.maxAttempts,
});
```

## Phase 4: Close Docs, CI, And Operational Verification Loop

**Objective:** Make the new runtime foundations visible and enforceable for contributors and operators.

**Files:**
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/operations/TESTING.md`
- Modify: `docs/operations/CI_CD.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docs/architecture/ARCHITECTURE.md`
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- Modify: `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] Add one explicit runtime-foundations verification section to docs that shows what to run locally before merging runtime/reliability changes.
- [ ] Decide whether runtime metrics stay as internal/test-visible snapshots or gain a stable operator endpoint in this phase; document the decision either way.
- [ ] Add doc-drift and/or truth-source coverage if new runtime endpoints, env vars, or policy guarantees are now contractual.
- [ ] Add a dedicated CI command or job grouping for runtime-foundations tests if the touched matrix is otherwise too implicit.
- [ ] Ensure the final docs tell a coherent production story: process alive, instance ready, dependencies degraded, background workers healthy, retries bounded, dead-letter state inspectable.

**Completion standard:**

- [ ] A new contributor can discover the runtime foundations from docs without reading implementation code first.
- [ ] CI explicitly exercises the new runtime/reliability test surface.
- [ ] Truth-source docs identify the authoritative files for runtime status fields, resilience policy, and worker reliability policy.
- [ ] Runtime hardening is no longer "tribal knowledge" spread across route tests and historical plans.

**Document updates in this phase:**

- [ ] Update `docs/reference/SYSTEM_TRUTH_SOURCES.md` with runtime status, resilience policy, and worker-policy authoritative sources.
- [ ] Update `docs/operations/CI_CD.md` with any new runtime job or command grouping.
- [ ] Update `docs/operations/TESTING.md` with a final validation matrix for observability + reliability.
- [ ] Update `docs/architecture/ARCHITECTURE.md` and `docs/architecture/DEPLOYMENT.md` so runtime behavior is described consistently.

**Tests / eval updates in this phase:**

- [ ] Update `packages/server/src/__tests__/docs-truth-smoke.test.ts` with assertions for new runtime doc phrases / truth-source references.
- [ ] Run:
```bash
rtk pnpm check:docs-drift
```
  - Expected: pass
- [ ] Run:
```bash
rtk pnpm check:complexity
```
  - Expected: pass
- [ ] Run:
```bash
rtk pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts
```
  - Expected: pass

**Example structure or code:**
```json
{
  "runtimeFoundations": {
    "command": "pnpm test -- --run packages/server/src/app.test.ts packages/server/src/lib/runtime/resilience.test.ts packages/server/src/lib/queue/task-queue.test.ts",
    "purpose": "Verify request context, runtime health/readiness, resilience execution, and worker retry/dead-letter behavior."
  }
}
```

## Final Verification Checklist

- [ ] `rtk pnpm typecheck`
- [ ] `rtk pnpm test -- --run packages/server/src/app.test.ts packages/server/src/lib/runtime/runtime-metadata.test.ts`
- [ ] `rtk pnpm test -- --run packages/server/src/lib/runtime/resilience.test.ts packages/server/src/lib/runtime/metrics.test.ts`
- [ ] `rtk pnpm test -- --run packages/server/src/lib/queue/task-queue.test.ts packages/server/src/lib/lifecycle/outbox.test.ts`
- [ ] `rtk pnpm test -- --run packages/server/src/__tests__/candidate-pipeline.test.ts packages/server/src/lib/lifecycle/subscribers/subscribers-integration.test.ts`
- [ ] `rtk pnpm check:docs-drift`
- [ ] `rtk pnpm check:complexity`

## Risks To Watch During Execution

- [ ] Avoid overbuilding a telemetry platform before nailing the minimum server/runtime contract.
- [ ] Avoid introducing divergent retry policies across request path, queue path, and lifecycle path after the resilience layer exists.
- [ ] Watch `packages/server/src/app.ts` and worker/bootstrap files for complexity regression; split early into focused `lib/runtime/*` modules instead of growing composition-root logic.
- [ ] Keep JSON-store compatibility behavior explicit; do not accidentally make PostgreSQL-only runtime assumptions look universal in docs or readiness output.
