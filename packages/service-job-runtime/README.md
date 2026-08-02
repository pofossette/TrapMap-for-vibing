# @trapmap/service-job-runtime

Shared job runtime service module for host assembly containers.

The `service-job-runtime` package is the runtime owner of `task_queue` and `domain_event_outbox` claim, complete, fail, requeue, lease, and dead-letter operations. Business services schedule follow-up work through the internal job-runtime port rather than directly accessing these runtime write capabilities. Business facts and local outbox append operations remain the responsibility of each aggregate owner.

## Purpose

This package provides:

- **Task queue runtime**: Claim, process, retry, and dead-letter background tasks with exponential backoff
- **Domain event outbox runtime**: Claim, complete, and fail domain events with automatic requeue
- **Async transport layer**: PostgreSQL and RabbitMQ task queue implementations
- **HTTP API**: Internal REST endpoints for job scheduling, status, and queue monitoring
- **Pre-built task handlers**: Governance conflict detection and feedback remediation handlers
- **Migration management**: Drizzle ORM migration runner with ownership assertions

## Installation

```bash
pnpm add @trapmap/service-job-runtime
```

## Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `@trapmap/backend-core` | Core job runtime module, ports, and error types |
| `@trapmap/contracts` | Shared schemas for governance payloads |
| `@trapmap/persistence-schema` | Database schema definitions for task_queue and domain_event_outbox |
| `fastify` | HTTP server framework |
| `drizzle-orm` | Database migration runner |
| `pg` | PostgreSQL client |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type checking and compilation |
| `vitest` | Test runner |
| `@types/node` | Node.js type definitions |
| `@types/pg` | PostgreSQL client type definitions |

## Public API

### Core Factory Functions

#### `createJobRuntimeDeps(deps: JobRuntimePortDeps): JobRuntimeServiceDeps`

Creates a dependency bundle for the job runtime service.

```typescript
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';

const deps = createJobRuntimeDeps({
  queuePorts,
  auditLog,
  taskHandlers: [governanceConflictHandler],
  ownsWork: true,
  outboxHandlers: [{ eventName: 'knowledge.approved', handle: async (payload) => { /* ... */ } }],
});
```

**Parameters:**

- `queuePorts`: Queue ports for task and outbox operations
- `auditLog`: Audit log port for logging
- `taskHandlers` (optional): Array of task handlers to register
- `ownsWork` (optional, default: `true`): Whether this runtime instance owns work processing
- `outboxHandlers` (optional): Array of outbox event handlers

#### `createJobRuntimeServiceModule(deps: JobRuntimeDeps): JobRuntimePort`

Creates the core job runtime module.

```typescript
import { createJobRuntimeServiceModule } from '@trapmap/service-job-runtime';

const module = createJobRuntimeServiceModule(deps);
```

#### `createJobRuntimeServer(config: JobRuntimeServiceConfig, deps: JobRuntimeServiceDeps): Promise<JobRuntimeServer>`

Creates a complete job runtime server with HTTP endpoints and task consumers.

```typescript
import { createJobRuntimeServer } from '@trapmap/service-job-runtime';

const server = await createJobRuntimeServer(
  { host: '127.0.0.1', port: 3000, logLevel: 'info' },
  deps,
);

await server.start();
// ... later
await server.close();
```

**Configuration options:**

- `host`: Server bind address
- `port`: Server port number
- `logLevel`: Fastify log level ('silent', 'error', 'warn', 'info', 'debug', 'trace')

**Server interface:**

- `app`: Fastify instance
- `module`: JobRuntimePort instance
- `outboxConsumer` (optional): Outbox consumer if handlers were provided
- `start()`: Start listening on configured host:port
- `close()`: Stop consumers and close HTTP server

### Async Transport

#### `createJobRuntimeAsyncTransport(params): JobRuntimeAsyncTransport`

Creates an async transport bundle with PostgreSQL or RabbitMQ task queue and PostgreSQL outbox.

```typescript
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';

// PostgreSQL transport (default)
const transport = createJobRuntimeAsyncTransport({
  config: { asyncTaskTransport: { provider: 'postgres', rabbitmq: null } },
  pool,
});

// RabbitMQ transport
const transport = createJobRuntimeAsyncTransport({
  config: {
    asyncTaskTransport: {
      provider: 'rabbitmq',
      rabbitmq: { url: 'amqp://localhost', exchange: 'trapmap.tasks', queue: 'trapmap.candidate', prefetch: 4 },
    },
  },
  pool,
});
```

**Transport interface:**

- `task.enqueue(type, payload, options?)`: Enqueue a task
- `task.enqueueTx(client, type, payload, options?)`: Enqueue within an existing transaction
- `task.requeue(taskId)`: Requeue a dead task (PostgreSQL only)
- `task.getStatusSnapshot()`: Get queue status counts
- `task.createConsumer(params)`: Create a task consumer
- `events.enqueue(params)`: Enqueue an outbox event
- `events.enqueueTx(client, params)`: Enqueue outbox event within transaction
- `events.claimBatch(limit?, workerId?)`: Claim a batch of pending events
- `events.complete(eventId)`: Mark event as completed
- `events.fail(eventId, error)`: Mark event as failed

**Task enqueue options:**

- `priority` (default: `0`): Task priority (higher = processed first)
- `maxAttempts` (default: `3`): Maximum retry attempts before dead-letter
- `delayMs` (default: `0`): Delay before task becomes available
- `dedupeKey` (optional): Deduplication key for idempotent enqueue

### RabbitMQ Transport

#### `createRabbitMqTaskTransport(config: RabbitMqTaskTransportConfig): RabbitMqTaskTransport`

Creates a RabbitMQ-specific task transport.

```typescript
import { createRabbitMqTaskTransport } from '@trapmap/service-job-runtime';

const transport = createRabbitMqTaskTransport({
  url: 'amqp://guest:guest@localhost:5672',
  exchange: 'trapmap.tasks',
  queue: 'trapmap.candidate',
  prefetch: 4,
  channelFactory: async () => channel, // optional custom channel factory
  connectionFactory: async () => connection, // optional custom connection factory
});
```

**Configuration:**

- `url`: RabbitMQ connection URL
- `exchange`: Exchange name (created as durable topic exchange)
- `queue`: Queue name (created as durable queue)
- `prefetch`: Prefetch count for consumers
- `channelFactory` (optional): Custom channel factory
- `connectionFactory` (optional): Custom connection factory

### Outbox Consumer

#### `createJobRuntimeOutboxConsumer(params): JobRuntimeOutboxConsumer`

Creates a consumer that polls and processes domain events from the outbox.

```typescript
import { createJobRuntimeOutboxConsumer } from '@trapmap/service-job-runtime';

const consumer = createJobRuntimeOutboxConsumer({
  outbox: outboxPort,
  handlers: [
    { eventName: 'knowledge.approved', handle: async (payload) => { /* ... */ } },
    { eventName: 'candidate.created', handle: async (payload) => { /* ... */ } },
  ],
  ownsWork: true,
  pollIntervalMs: 2000, // optional, default: 2000ms
  onError: (error, event) => { /* ... */ }, // optional error callback
});

await consumer.run();
// ... later
await consumer.stop();
```

**Consumer interface:**

- `run()`: Start consuming events
- `stop()`: Stop consuming and wait for current batch to complete
- `isRunning()`: Check if consumer is active
- `ownsWork()`: Check if consumer owns work processing

### Task Handlers

#### `createGovernanceConflictTaskHandler(workflow): TaskHandler`

Creates a task handler for governance conflict detection.

```typescript
import { createGovernanceConflictTaskHandler } from '@trapmap/service-job-runtime';

const handler = createGovernanceConflictTaskHandler(workflowPort);
// handler.type === 'governance.conflict-detection'
```

#### `createGovernanceRemediationTaskHandler(commands): TaskHandler`

Creates a task handler for feedback remediation reactivation.

```typescript
import { createGovernanceRemediationTaskHandler } from '@trapmap/service-job-runtime';

const handler = createGovernanceRemediationTaskHandler(commandsPort);
// handler.type === 'feedback.remediation-reactivation'
```

#### `createGovernanceBadcaseExportDraftTaskHandler(commands): TaskHandler`

Creates a task handler for badcase export draft generation.

```typescript
import { createGovernanceBadcaseExportDraftTaskHandler } from '@trapmap/service-job-runtime';

const handler = createGovernanceBadcaseExportDraftTaskHandler(commandsPort);
// handler.type === 'feedback.badcase-export-draft'
```

### Migration Management

#### `runJobRuntimeMigrations(pool: Pool): Promise<void>`

Runs all pending migrations for the job runtime package.

```typescript
import { runJobRuntimeMigrations } from '@trapmap/service-job-runtime';

await runJobRuntimeMigrations(pool);
```

#### `assertJobRuntimeMigrationSet(folder?): Promise<void>`

Asserts that the migration folder contains only expected migrations.

```typescript
import { assertJobRuntimeMigrationSet } from '@trapmap/service-job-runtime';

await assertJobRuntimeMigrationSet(); // uses default folder
await assertJobRuntimeMigrationSet('/path/to/custom/migrations'); // custom folder
```

### Route Registration

#### `registerJobRuntimeRoutes(app: FastifyInstance, module: JobRuntimePort): void`

Registers HTTP routes on a Fastify instance.

```typescript
import { registerJobRuntimeRoutes } from '@trapmap/service-job-runtime';

registerJobRuntimeRoutes(app, module);
```

**Registered endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/jobs` | Schedule a new job |
| `GET` | `/internal/jobs/:jobId` | Get job status |
| `GET` | `/internal/jobs/queue` | Get queue status snapshot |
| `GET` | `/internal/health` | Health check endpoint |

**POST /internal/jobs request body:**

```json
{
  "type": "governance.conflict-detection",
  "payload": { "entryId": "entry-1" },
  "delayMs": 250,
  "priority": 5,
  "maxAttempts": 4,
  "dedupeKey": "governance.conflict-detection:entry-1:event-1"
}
```

**POST /internal/jobs response (201):**

```json
{ "jobId": "task_1234_abc56789" }
```

## Usage Examples

### Basic Server Setup

```typescript
import { createJobRuntimeDeps, createJobRuntimeServer } from '@trapmap/service-job-runtime';

const deps = createJobRuntimeDeps({
  queuePorts,
  auditLog,
  taskHandlers: [governanceConflictHandler],
  ownsWork: true,
});

const server = await createJobRuntimeServer(
  { host: '0.0.0.0', port: 3000, logLevel: 'info' },
  deps,
);

await server.start();
console.log('Job runtime server listening on :3000');
```

### Custom Outbox Handlers

```typescript
import { createJobRuntimeDeps, createJobRuntimeServer } from '@trapmap/service-job-runtime';

const deps = createJobRuntimeDeps({
  queuePorts,
  auditLog,
  outboxHandlers: [
    {
      eventName: 'knowledge.approved',
      async handle(payload) {
        console.log('Knowledge approved:', payload);
        // Process approved knowledge
      },
    },
  ],
  ownsWork: true,
});

const server = await createJobRuntimeServer(
  { host: '0.0.0.0', port: 3000, logLevel: 'info' },
  deps,
);

await server.start();
```

### Read-Only Runtime (No Work Ownership)

```typescript
import { createJobRuntimeDeps, createJobRuntimeServer } from '@trapmap/service-job-runtime';

const deps = createJobRuntimeDeps({
  queuePorts,
  auditLog,
  ownsWork: false, // This instance only serves HTTP API, doesn't process tasks
});

const server = await createJobRuntimeServer(
  { host: '0.0.0.0', port: 3001, logLevel: 'info' },
  deps,
);

await server.start();
```

### RabbitMQ Transport

```typescript
import {
  createJobRuntimeAsyncTransport,
  createRabbitMqTaskTransport,
} from '@trapmap/service-job-runtime';

const transport = createJobRuntimeAsyncTransport({
  config: {
    asyncTaskTransport: {
      provider: 'rabbitmq',
      rabbitmq: {
        url: process.env.RABBITMQ_URL!,
        exchange: 'trapmap.tasks',
        queue: 'trapmap.candidate',
        prefetch: 4,
      },
    },
  },
  pool,
});

// Enqueue a task
await transport.task.enqueue('candidate_processing', { candidateId: 'cand_1' });

// Enqueue within a transaction
await transport.task.enqueueTx(client, 'candidate_processing', { candidateId: 'cand_1' });
```

### Standalone Outbox Consumer

```typescript
import { createJobRuntimeOutboxConsumer } from '@trapmap/service-job-runtime';

const consumer = createJobRuntimeOutboxConsumer({
  outbox: outboxPort,
  handlers: [
    { eventName: 'knowledge.approved', handle: processApprovedKnowledge },
    { eventName: 'candidate.created', handle: processCreatedCandidate },
  ],
  ownsWork: true,
  pollIntervalMs: 1000,
  onError: (error, event) => {
    console.error('Outbox handler failed:', error, event);
  },
});

await consumer.run();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.stop();
  process.exit(0);
});
```

## Architecture

### Task Queue Lifecycle

```
pending → running → completed
    ↑        ↓
    └── (retry with backoff) ──┘
              ↓
           dead (after max attempts)
```

### Outbox Event Lifecycle

```
pending → processing → completed
    ↑        ↓
    └── (retry with backoff) ──┘
              ↓
           failed (after 3 attempts)
```

### Lease-Based Claiming

Both task queue and outbox use lease-based claiming to prevent duplicate processing:

- Tasks are claimed with `FOR UPDATE SKIP LOCKED` for concurrent safety
- Leases expire after 30 seconds by default
- Stale leases are automatically reclaimed before each claim cycle
- Worker IDs are generated as `{type}_{pid}_{uuid}` for traceability

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm exec vitest

# Type checking
pnpm typecheck
```

## Build

```bash
pnpm build
```

## License

Private package - part of the TrapMap monorepo.