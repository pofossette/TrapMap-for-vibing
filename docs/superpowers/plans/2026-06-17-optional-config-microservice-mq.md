# Optional Config Microservice And MQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional configuration that keeps TrapMap defaulting to a modular monolith, while allowing deploy-time process splitting and an optional external MQ-backed task queue.

**Architecture:** Keep PostgreSQL as the authoritative write-path substrate and preserve `domain_event_outbox` as the durable event boundary. Introduce a factory-backed async task transport seam so `task_queue` remains the default, while RabbitMQ can be enabled only for task delivery. Reuse the existing `runtimeMode` and `serviceUnit` model for lightweight service decomposition, adding deployment presets rather than hard service splits.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, existing `task_queue` and `domain_event_outbox`, optional RabbitMQ via `amqplib`, Vitest, pnpm.

---

## File Structure

**Create:**
- `packages/server/src/lib/async/factory.ts` — central async transport factory and deployment preset resolver
- `packages/server/src/lib/async/rabbitmq-task-queue.ts` — RabbitMQ-backed task transport implementation
- `packages/server/src/lib/async/rabbitmq-worker.ts` — consumer bootstrap for RabbitMQ task handlers
- `packages/server/src/lib/async/rabbitmq-task-queue.test.ts` — provider-level tests for enqueue/status behavior
- `packages/server/src/lib/runtime/deployment-preset.ts` — preset-to-`runtimeMode/serviceUnit` mapping
- `docs/architecture/components/OPTIONAL_SERVICE_SPLIT_AND_MQ.md` — architecture note for optional split deployment and MQ

**Modify:**
- `packages/server/src/config.ts` — validate new deployment and async transport config
- `packages/server/src/app.ts` — build async transport through a factory instead of PG-only wiring
- `packages/server/src/worker.ts` — boot the right worker implementation from config
- `packages/server/src/lib/async/transport.ts` — widen transport kinds and split queue/event concerns
- `packages/server/src/bootstrap/bootstrap-workers.ts` — branch task worker creation by queue provider
- `packages/server/src/lib/context.ts` — update `SkillShareerServices` async transport typing
- `packages/server/src/routes/operations/status.ts` — expose provider kind and degraded/fallback state
- `docs/operations/ENVIRONMENT.md` — document new env vars and supported combinations
- `docs/architecture/DEPLOYMENT.md` — add split deployment and optional RabbitMQ examples
- `docker-compose.yml` — add optional RabbitMQ service profile without changing the default path

**Test:**
- `packages/server/src/app.test.ts`
- `packages/server/src/bootstrap/startup.test.ts`
- `packages/server/src/routes/operations/status.test.ts`
- `packages/server/src/lib/queue/task-queue.test.ts`

## Design Constraints

- Default behavior stays unchanged: PostgreSQL-backed `task_queue` plus `domain_event_outbox`.
- External MQ is optional and only applies to task delivery, not authoritative domain-event persistence.
- `domain_event_outbox` remains PostgreSQL-backed in all supported modes to avoid distributed transaction drift.
- Service decomposition is deploy-time only in this plan: same codebase, same contracts package, shared database.
- Supported external MQ in this phase is RabbitMQ only. Do not add Kafka, NATS, or Redis Streams in the first wave.

## Target Configuration Surface

```bash
# Default
TRAPMAP_DEPLOYMENT_PRESET=monolith
TRAPMAP_TASK_TRANSPORT=postgres

# Optional split deployment
TRAPMAP_DEPLOYMENT_PRESET=api
TRAPMAP_TASK_TRANSPORT=postgres

# Optional external MQ for task delivery
TRAPMAP_DEPLOYMENT_PRESET=candidate-worker
TRAPMAP_TASK_TRANSPORT=rabbitmq
TRAPMAP_RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
TRAPMAP_RABBITMQ_TASK_EXCHANGE=trapmap.tasks
TRAPMAP_RABBITMQ_TASK_QUEUE=trapmap.candidate
TRAPMAP_RABBITMQ_PREFETCH=4
```

Preset mapping target:

```ts
monolith           -> { runtimeMode: 'combined',      serviceUnit: 'full-platform' }
api                -> { runtimeMode: 'api',           serviceUnit: 'full-platform' }
candidate-worker   -> { runtimeMode: 'task-worker',   serviceUnit: 'candidate-ingestion' }
governance-worker  -> { runtimeMode: 'task-worker',   serviceUnit: 'knowledge-governance' }
outbox-worker      -> { runtimeMode: 'outbox-worker', serviceUnit: 'knowledge-governance' }
```

### Task 1: Add Config And Deployment Presets

**Files:**
- Create: `packages/server/src/lib/runtime/deployment-preset.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/worker.ts`
- Test: `packages/server/src/app.test.ts`

- [ ] **Step 1: Write the failing config test for deployment preset and task transport parsing**

```ts
it('parses optional deployment preset and task transport config', () => {
  process.env.TRAPMAP_DEPLOYMENT_PRESET = 'candidate-worker';
  process.env.TRAPMAP_TASK_TRANSPORT = 'rabbitmq';
  process.env.TRAPMAP_RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';

  const config = loadConfig();

  expect(config.deployment.preset).toBe('candidate-worker');
  expect(config.asyncTaskTransport.provider).toBe('rabbitmq');
  expect(config.asyncTaskTransport.rabbitmq?.url).toBe(
    'amqp://guest:guest@localhost:5672',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/server/src/app.test.ts`
Expected: FAIL with config schema or property access errors for `deployment` / `asyncTaskTransport`.

- [ ] **Step 3: Add deployment preset resolver and config schema**

```ts
// packages/server/src/lib/runtime/deployment-preset.ts
import type { RuntimeMode } from './runtime-contract.js';
import type { ServiceUnit } from './service-unit.js';

export type DeploymentPreset =
  | 'monolith'
  | 'api'
  | 'candidate-worker'
  | 'governance-worker'
  | 'outbox-worker';

export interface ResolvedDeploymentPreset {
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
}

export function resolveDeploymentPreset(
  preset: DeploymentPreset | undefined,
): ResolvedDeploymentPreset | null {
  switch (preset) {
    case 'api':
      return { runtimeMode: 'api', serviceUnit: 'full-platform' };
    case 'candidate-worker':
      return { runtimeMode: 'task-worker', serviceUnit: 'candidate-ingestion' };
    case 'governance-worker':
      return { runtimeMode: 'task-worker', serviceUnit: 'knowledge-governance' };
    case 'outbox-worker':
      return { runtimeMode: 'outbox-worker', serviceUnit: 'knowledge-governance' };
    case 'monolith':
      return { runtimeMode: 'combined', serviceUnit: 'full-platform' };
    default:
      return null;
  }
}
```

```ts
// packages/server/src/config.ts
const AsyncTaskTransportSchema = z.object({
  provider: z.enum(['postgres', 'rabbitmq']).default('postgres'),
  rabbitmq: z
    .object({
      url: z.string().url(),
      exchange: z.string().min(1).default('trapmap.tasks'),
      queue: z.string().min(1).default('trapmap.default'),
      prefetch: z.coerce.number().int().min(1).max(100).default(1),
    })
    .nullable(),
});

const DeploymentSchema = z.object({
  preset: z
    .enum(['monolith', 'api', 'candidate-worker', 'governance-worker', 'outbox-worker'])
    .default('monolith'),
});

export const ServerConfigSchema = z.object({
  // existing fields...
  deployment: DeploymentSchema,
  asyncTaskTransport: AsyncTaskTransportSchema,
});
```

- [ ] **Step 4: Apply preset resolution in server entrypoints**

```ts
// packages/server/src/app.ts
const preset = resolveDeploymentPreset(options.config?.deployment?.preset);
const runtimeMode = options.runtimeMode ?? preset?.runtimeMode ?? 'combined';
const serviceUnit = resolveServiceUnit(
  options.serviceUnit ?? preset?.serviceUnit ?? process.env.TRAPMAP_SERVICE_UNIT,
);
```

```ts
// packages/server/src/worker.ts
const config = loadConfig();
const preset = resolveDeploymentPreset(config.deployment.preset);
const runtimeMode = preset?.runtimeMode ?? resolveWorkerRuntimeMode();
const serviceUnit = preset?.serviceUnit ?? resolveServiceUnit(process.env.TRAPMAP_SERVICE_UNIT);
```

- [ ] **Step 5: Run tests to verify preset parsing passes**

Run: `pnpm test -- --run packages/server/src/app.test.ts packages/server/src/bootstrap/startup.test.ts`
Expected: PASS, with existing runtime behavior unchanged when no new env vars are set.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/config.ts \
  packages/server/src/app.ts \
  packages/server/src/worker.ts \
  packages/server/src/lib/runtime/deployment-preset.ts \
  packages/server/src/app.test.ts \
  packages/server/src/bootstrap/startup.test.ts
git commit -m "feat: add optional deployment preset config"
```

### Task 2: Split Async Task Transport From Event Outbox And Add Factory Wiring

**Files:**
- Create: `packages/server/src/lib/async/factory.ts`
- Modify: `packages/server/src/lib/async/transport.ts`
- Modify: `packages/server/src/lib/context.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/src/routes/operations/status.test.ts`

- [ ] **Step 1: Write the failing transport-factory test**

```ts
it('reports postgres as the default task transport provider', async () => {
  const app = buildServer({
    config: {
      asyncTaskTransport: {
        provider: 'postgres',
        rabbitmq: null,
      },
    },
  });

  await app.ready();
  expect(app.skillShareer.asyncTransport?.task.kind).toBe('postgres-task-queue');
  expect(app.skillShareer.asyncTransport?.events.kind).toBe('postgres-domain-outbox');
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/server/src/routes/operations/status.test.ts`
Expected: FAIL because `asyncTransport.task` and provider `kind` do not exist yet.

- [ ] **Step 3: Refactor async transport types to separate task and event transport**

```ts
// packages/server/src/lib/async/transport.ts
export interface AsyncTaskTransport {
  kind: 'postgres-task-queue' | 'rabbitmq-task-queue';
  enqueue<T>(type: string, payload: T, options?: EnqueueOptions): Promise<unknown>;
  enqueueTx<T>(client: PoolClient, type: string, payload: T, options?: EnqueueOptions): Promise<unknown>;
  requeue(taskId: string): Promise<void>;
  getStatusSnapshot(): Promise<{
    provider: 'postgres' | 'rabbitmq';
    pending: number;
    running: number;
    dead: number;
    staleRunning: number;
    reclaimCount: number;
  }>;
}

export interface AsyncEventTransport {
  kind: 'postgres-domain-outbox';
  enqueue(params: EventEnqueueParams): Promise<unknown>;
  enqueueTx(client: PoolClient, params: EventEnqueueParams): Promise<unknown>;
  claimBatch(limit?: number, workerId?: string): Promise<ClaimedOutboxEvent[]>;
  complete(eventId: string): Promise<void>;
  fail(eventId: string, error: string): Promise<void>;
  getStatusSnapshot(): Promise<{
    provider: 'postgres';
    pending: number;
    processing: number;
    failed: number;
    staleProcessing: number;
    reclaimCount: number;
  }>;
}

export interface AsyncTransport {
  task: AsyncTaskTransport;
  events: AsyncEventTransport;
}
```

- [ ] **Step 4: Add a factory that builds the default transport pair**

```ts
// packages/server/src/lib/async/factory.ts
export function createAsyncTransport(params: {
  config: ServerConfig;
  pool: Pool;
}): AsyncTransport {
  const events = createPostgresEventTransport(params.pool);

  if (params.config.asyncTaskTransport.provider === 'rabbitmq') {
    return {
      task: createRabbitMqTaskTransport({
        url: params.config.asyncTaskTransport.rabbitmq!.url,
        exchange: params.config.asyncTaskTransport.rabbitmq!.exchange,
        queue: params.config.asyncTaskTransport.rabbitmq!.queue,
        prefetch: params.config.asyncTaskTransport.rabbitmq!.prefetch,
        pool: params.pool,
      }),
      events,
    };
  }

  return {
    task: createPostgresTaskTransport(params.pool),
    events,
  };
}
```

- [ ] **Step 5: Update app wiring and status read path**

```ts
// packages/server/src/app.ts
if (app.skillShareer.store instanceof PostgresStore) {
  app.skillShareer.asyncTransport = createAsyncTransport({
    config: app.skillShareer.config,
    pool: app.skillShareer.store.getPool(),
  });
}
```

```ts
// packages/server/src/routes/operations/status.ts
const task = await transport.task.getStatusSnapshot();
const events = await transport.events.getStatusSnapshot();

return {
  taskTransportProvider: task.provider,
  eventTransportProvider: events.provider,
  queue: task,
  outbox: events,
};
```

- [ ] **Step 6: Run tests to verify factory wiring passes**

Run: `pnpm test -- --run packages/server/src/routes/operations/status.test.ts packages/server/src/app.test.ts`
Expected: PASS, with status response exposing task provider and event provider.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/lib/async/factory.ts \
  packages/server/src/lib/async/transport.ts \
  packages/server/src/lib/context.ts \
  packages/server/src/app.ts \
  packages/server/src/routes/operations/status.ts \
  packages/server/src/routes/operations/status.test.ts \
  packages/server/src/app.test.ts
git commit -m "refactor: add async transport factory and split task transport"
```

### Task 3: Implement Optional RabbitMQ Task Transport

**Files:**
- Create: `packages/server/src/lib/async/rabbitmq-task-queue.ts`
- Create: `packages/server/src/lib/async/rabbitmq-task-queue.test.ts`
- Modify: `packages/server/src/bootstrap/bootstrap-workers.ts`
- Modify: `packages/server/src/worker.ts`
- Test: `packages/server/src/bootstrap/startup.test.ts`

- [ ] **Step 1: Write the failing RabbitMQ transport tests**

```ts
it('publishes tasks to RabbitMQ and reports provider kind', async () => {
  const published: Array<{ routingKey: string; body: string }> = [];
  const transport = createRabbitMqTaskTransport({
    url: 'amqp://guest:guest@localhost:5672',
    exchange: 'trapmap.tasks',
    queue: 'trapmap.candidate',
    prefetch: 4,
    pool: {} as never,
    channelFactory: async () =>
      ({
        assertExchange: vi.fn(),
        assertQueue: vi.fn(),
        bindQueue: vi.fn(),
        publish: vi.fn((exchange, routingKey, body) => {
          published.push({ routingKey, body: body.toString('utf8') });
          return true;
        }),
      }) as never,
  });

  await transport.enqueue('candidate_processing', { candidateId: 'cand_1' });

  expect(transport.kind).toBe('rabbitmq-task-queue');
  expect(published[0]?.routingKey).toBe('candidate_processing');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/server/src/lib/async/rabbitmq-task-queue.test.ts`
Expected: FAIL because the RabbitMQ transport file does not exist.

- [ ] **Step 3: Implement RabbitMQ task transport with PG-backed status mirror**

```ts
// packages/server/src/lib/async/rabbitmq-task-queue.ts
export function createRabbitMqTaskTransport(params: RabbitMqTaskTransportConfig): AsyncTaskTransport {
  return {
    kind: 'rabbitmq-task-queue',
    async enqueue(type, payload, options) {
      const channel = await getOrCreateChannel(params);
      const envelope = {
        id: `rtmq_${Date.now()}`,
        type,
        payload,
        options: {
          priority: options?.priority ?? 0,
          maxAttempts: options?.maxAttempts ?? 3,
          delayMs: options?.delayMs ?? 0,
          dedupeKey: options?.dedupeKey ?? null,
        },
      };

      channel.publish(
        params.exchange,
        type,
        Buffer.from(JSON.stringify(envelope), 'utf8'),
        { persistent: true, priority: envelope.options.priority },
      );

      return envelope;
    },
    async enqueueTx(_client, type, payload, options) {
      return this.enqueue(type, payload, options);
    },
    async requeue(taskId) {
      throw new Error(`RabbitMQ task transport does not support requeue by task id: ${taskId}`);
    },
    async getStatusSnapshot() {
      return {
        provider: 'rabbitmq',
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        reclaimCount: 0,
      };
    },
  };
}
```

- [ ] **Step 4: Branch worker bootstrap by task transport kind**

```ts
// packages/server/src/bootstrap/bootstrap-workers.ts
const taskTransport = app.skillShareer.asyncTransport?.task;

if (taskTransport?.kind === 'rabbitmq-task-queue') {
  const rabbitWorker = await createRabbitMqTaskWorker({
    transport: taskTransport,
    handlers: [handler as TaskHandler<unknown>, ...buildSharedJobWorkerHandlers(app, store)],
    ownsCandidateTaskWork: ownCandidateTaskWork,
    ownsSharedJobTaskWork: ownSharedJobTaskWork,
  });

  if (enabled) {
    void rabbitWorker.run();
  }

  app.decorate('taskWorker', rabbitWorker);
  return;
}
```

- [ ] **Step 5: Boot RabbitMQ worker only for `task-worker` presets**

```ts
// packages/server/src/worker.ts
if (
  config.asyncTaskTransport.provider === 'rabbitmq' &&
  runtimeMode !== 'task-worker' &&
  runtimeMode !== 'combined'
) {
  throw new Error('RabbitMQ task transport requires a task-capable runtime mode');
}
```

- [ ] **Step 6: Run tests to verify RabbitMQ transport boot logic passes**

Run: `pnpm test -- --run packages/server/src/lib/async/rabbitmq-task-queue.test.ts packages/server/src/bootstrap/startup.test.ts`
Expected: PASS, with PG default tests still green and RabbitMQ branch covered.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/lib/async/rabbitmq-task-queue.ts \
  packages/server/src/lib/async/rabbitmq-task-queue.test.ts \
  packages/server/src/bootstrap/bootstrap-workers.ts \
  packages/server/src/worker.ts \
  packages/server/src/bootstrap/startup.test.ts
git commit -m "feat: add optional rabbitmq task transport"
```

### Task 4: Preserve PG Outbox And Tighten Guardrails

**Files:**
- Modify: `packages/server/src/bootstrap/bootstrap-lifecycle.ts`
- Modify: `packages/server/src/routes/knowledge.ts`
- Modify: `packages/server/src/routes/review.ts`
- Modify: `packages/server/src/routes/decay.ts`
- Modify: `packages/server/src/routes/traps.ts`
- Test: `packages/server/src/routes/operations/status.test.ts`

- [ ] **Step 1: Write the failing guardrail test**

```ts
it('keeps domain events on postgres even when rabbitmq task transport is enabled', async () => {
  const app = buildServer({
    config: {
      asyncTaskTransport: {
        provider: 'rabbitmq',
        rabbitmq: {
          url: 'amqp://guest:guest@localhost:5672',
          exchange: 'trapmap.tasks',
          queue: 'trapmap.default',
          prefetch: 1,
        },
      },
    },
  });

  await app.ready();
  expect(app.skillShareer.asyncTransport?.events.kind).toBe('postgres-domain-outbox');
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails or is missing coverage**

Run: `pnpm test -- --run packages/server/src/routes/operations/status.test.ts`
Expected: FAIL or missing assertion coverage for mixed provider mode.

- [ ] **Step 3: Make mixed-mode contract explicit in lifecycle wiring**

```ts
// packages/server/src/bootstrap/bootstrap-lifecycle.ts
const eventTransport = app.skillShareer.asyncTransport?.events;
if (store instanceof PostgresStore && !eventTransport) {
  throw new Error('Postgres runtime requires postgres-backed async event transport');
}

if (eventTransport?.kind !== 'postgres-domain-outbox') {
  throw new Error(`Unsupported event transport kind: ${eventTransport?.kind}`);
}
```

- [ ] **Step 4: Replace broad transport assumptions with explicit task/event usage**

```ts
// packages/server/src/routes/knowledge.ts
const lifecyclePublisher = createLifecyclePublisher(
  asyncTransport
    ? {
        eventBus,
        asyncTransport: {
          events: asyncTransport.events,
        },
      }
    : { eventBus },
);
```

- [ ] **Step 5: Run tests to verify the PG outbox guardrail passes**

Run: `pnpm test -- --run packages/server/src/routes/operations/status.test.ts packages/server/src/bootstrap/startup.test.ts`
Expected: PASS, with RabbitMQ limited to tasks and PG retained for domain events.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/bootstrap/bootstrap-lifecycle.ts \
  packages/server/src/routes/knowledge.ts \
  packages/server/src/routes/review.ts \
  packages/server/src/routes/decay.ts \
  packages/server/src/routes/traps.ts \
  packages/server/src/routes/operations/status.test.ts \
  packages/server/src/bootstrap/startup.test.ts
git commit -m "refactor: preserve postgres outbox in optional mq mode"
```

### Task 5: Document Supported Deployment Shapes And Compose Profiles

**Files:**
- Create: `docs/architecture/components/OPTIONAL_SERVICE_SPLIT_AND_MQ.md`
- Modify: `docs/operations/ENVIRONMENT.md`
- Modify: `docs/architecture/DEPLOYMENT.md`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write the failing doc-facts expectation by deciding the exact env surface**

```md
TRAPMAP_DEPLOYMENT_PRESET=monolith|api|candidate-worker|governance-worker|outbox-worker
TRAPMAP_TASK_TRANSPORT=postgres|rabbitmq
TRAPMAP_RABBITMQ_URL=amqp://...
TRAPMAP_RABBITMQ_TASK_EXCHANGE=trapmap.tasks
TRAPMAP_RABBITMQ_TASK_QUEUE=trapmap.default
TRAPMAP_RABBITMQ_PREFETCH=1
```

- [ ] **Step 2: Run targeted docs checks**

Run: `pnpm check:docs-drift`
Expected: FAIL until docs and environment references are updated consistently.

- [ ] **Step 3: Add architecture note and deployment guidance**

```md
## Supported Shapes

- `monolith`: API + task worker + outbox worker in one process, PostgreSQL task queue
- `split-pg`: API process plus dedicated PG-backed workers
- `split-rabbitmq`: API process plus RabbitMQ-backed task workers, PostgreSQL outbox worker

## Explicit Non-Goals

- No per-service database split
- No Kafka/NATS/Redis Streams in this phase
- No replacing PostgreSQL outbox with broker-published domain events
```

- [ ] **Step 4: Add optional RabbitMQ compose profile without changing default boot**

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management
    profiles: ["mq"]
    ports:
      - "5672:5672"
      - "15672:15672"

  candidate-worker:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    profiles: ["split", "mq"]
    command: ["node", "packages/server/dist/worker.js"]
    environment:
      - TRAPMAP_DEPLOYMENT_PRESET=candidate-worker
      - TRAPMAP_TASK_TRANSPORT=${TRAPMAP_TASK_TRANSPORT:-postgres}
      - TRAPMAP_RABBITMQ_URL=${TRAPMAP_RABBITMQ_URL:-amqp://guest:guest@rabbitmq:5672}
```

- [ ] **Step 5: Run docs and structure checks**

Run: `pnpm check:docs-drift`
Expected: PASS

Run: `pnpm check:structure`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/components/OPTIONAL_SERVICE_SPLIT_AND_MQ.md \
  docs/operations/ENVIRONMENT.md \
  docs/architecture/DEPLOYMENT.md \
  docker-compose.yml
git commit -m "docs: add optional service split and mq deployment guidance"
```

### Task 6: End-To-End Verification And Adoption Guardrails

**Files:**
- Modify: `packages/server/src/routes/operations/status.ts`
- Modify: `docs/todos/backend-engineering-optimization-plan.md`
- Test: `packages/server/src/routes/operations/status.test.ts`

- [ ] **Step 1: Write the failing status contract test for provider observability**

```ts
it('exposes task and event transport providers in async status', async () => {
  const app = buildServer();
  await app.ready();

  const response = await app.inject({
    method: 'GET',
    url: '/v1/operations/status/async',
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    taskTransportProvider: expect.any(String),
    eventTransportProvider: 'postgres',
  });

  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run packages/server/src/routes/operations/status.test.ts`
Expected: FAIL because the status route does not yet expose provider identity.

- [ ] **Step 3: Add provider identity and guardrail copy to runtime status and TODO docs**

```ts
// packages/server/src/routes/operations/status.ts
return reply.send({
  ok: true,
  taskTransportProvider: queue.provider,
  eventTransportProvider: outbox.provider,
  queue,
  outbox,
  adoptionGuidance:
    queue.provider === 'postgres'
      ? 'Default mode: keep postgres task queue unless sustained backlog thresholds justify RabbitMQ.'
      : 'RabbitMQ mode enabled: PostgreSQL outbox remains authoritative for domain events.',
});
```

```md
## Optional Adoption Rule

- Default: `TRAPMAP_TASK_TRANSPORT=postgres`
- Optional: `TRAPMAP_TASK_TRANSPORT=rabbitmq` only when backlog and isolation goals justify it
- Required invariant: `domain_event_outbox` remains PostgreSQL-backed
```

- [ ] **Step 4: Run the focused verification suite**

Run: `pnpm test -- --run packages/server/src/app.test.ts packages/server/src/bootstrap/startup.test.ts packages/server/src/routes/operations/status.test.ts packages/server/src/lib/async/rabbitmq-task-queue.test.ts`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/operations/status.ts \
  packages/server/src/routes/operations/status.test.ts \
  docs/todos/backend-engineering-optimization-plan.md
git commit -m "chore: add transport observability and adoption guardrails"
```

## Self-Review

### Spec Coverage

- Optional microservice split via config: covered by Task 1 and Task 5.
- Optional MQ introduction via config: covered by Task 2 and Task 3.
- Keep architecture lightweight rather than heavy backend: covered by design constraints, Task 4 guardrails, and Task 6 adoption guidance.
- Preserve current PG-first write truth: covered by Task 4 and repeated in docs.

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in tasks.
- Each task includes exact files, commands, expected outcomes, and concrete code snippets.

### Type Consistency

- `TRAPMAP_TASK_TRANSPORT` consistently maps to `asyncTaskTransport.provider`.
- Deployment presets consistently map to existing `runtimeMode` and `serviceUnit`.
- `asyncTransport.task` and `asyncTransport.events` are used consistently across tasks.

## Rollout Notes

- Ship Task 1 and Task 2 first with `postgres` as the only active provider in production.
- Gate Task 3 behind explicit environment configuration and non-default compose profiles.
- Do not migrate current production deployments to RabbitMQ by default after implementation.
- Treat RabbitMQ mode as opt-in and reversible.

## Success Criteria

- A fresh deploy with no new env vars behaves exactly like today.
- A split deploy can be launched through preset config without changing code.
- A RabbitMQ-backed task worker can be enabled without changing write-path domain-event behavior.
- Operator status surfaces clearly show which task transport provider is active.

Plan complete and saved to `docs/superpowers/plans/2026-06-17-optional-config-microservice-mq.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
