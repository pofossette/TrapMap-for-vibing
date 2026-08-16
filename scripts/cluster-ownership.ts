import { randomUUID } from 'node:crypto';
import { createJobRuntimeOutboxConsumer } from '@trapmap/service-job-runtime';
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

/**
 * Cluster ownership verification (design D: compose replicas ownership).
 *
 * Proves SKIP LOCKED exactly-once semantics by running TWO in-process worker
 * instances sharing ONE postgres pool against the same task_queue / outbox.
 * With two replicas consuming the same queue, each task/event row is processed
 * exactly once (no duplicate consumption), because the async-runtime claim
 * uses `FOR UPDATE SKIP LOCKED` (the same claim SQL the real worker containers
 * use; real compose replicas can be additionally demonstrated with
 * `docker compose up -d --scale candidate-worker=2 --scale outbox-worker=2`).
 *
 * In-process fallback for compose replicas verification. Run with:
 *   pnpm test:cluster-ownership
 */

const DATABASE_URL =
  process.env.TRAPMAP_DATABASE_URL ?? 'postgres://trapmap:trapmap@127.0.0.1:5432/trapmap';
const SAMPLE_SIZE = Number(process.env.CLUSTER_OWNERSHIP_SAMPLE ?? 20);
const CONCURRENCY = 2; // two worker replicas
const IDLE_TIMEOUT_MS = Math.max(20_000, SAMPLE_SIZE * 1_500);

const runId = randomUUID().slice(0, 8);
const taskType = `cluster-ownership-${runId}`;
const eventName = `cluster-ownership.evt.${runId}`;
const aggregateId = `agg-${runId}`;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

interface OwnershipTrackers {
  handledTaskIds: Set<string>;
  duplicateTaskIds: string[];
  handledOutboxCount: number;
  taskCountsPerReplica: number[];
  outboxCountsPerReplica: number[];
}

function createOwnershipTrackers(): OwnershipTrackers {
  return {
    handledTaskIds: new Set<string>(),
    duplicateTaskIds: [],
    handledOutboxCount: 0,
    taskCountsPerReplica: Array.from({ length: CONCURRENCY }, () => 0),
    outboxCountsPerReplica: Array.from({ length: CONCURRENCY }, () => 0),
  };
}

async function seedRows(client: Pick<PoolClient, 'query'>): Promise<void> {
  for (let index = 0; index < SAMPLE_SIZE; index += 1) {
    await client.query(
      "INSERT INTO task_queue (id, type, payload, status, priority, attempts, max_attempts, process_after, created_at, updated_at) VALUES ($1, $2, $3, 'pending', 0, 0, 3, NOW(), NOW(), NOW())",
      [`task_${runId}_${index}`, taskType, JSON.stringify({ index, runId })],
    );
    await client.query(
      "INSERT INTO domain_event_outbox (id, aggregate_type, aggregate_id, event_name, payload, status, available_at, attempts, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', NOW(), 0, NOW())",
      [
        `evt_${runId}_${index}`,
        'cluster-ownership',
        aggregateId,
        eventName,
        JSON.stringify({ index, runId }),
      ],
    );
  }
}

type AsyncTransport = ReturnType<typeof createJobRuntimeAsyncTransport>;

async function createTaskWorkers(transport: AsyncTransport, trackers: OwnershipTrackers) {
  return Promise.all(
    Array.from({ length: CONCURRENCY }, (_, index) =>
      transport.task.createConsumer({
        ownsWork: true,
        handlers: [
          {
            type: taskType,
            async handle(task) {
              const id = String(task.id);
              if (trackers.handledTaskIds.has(id)) {
                trackers.duplicateTaskIds.push(id);
              }
              trackers.handledTaskIds.add(id);
              trackers.taskCountsPerReplica[index] += 1;
            },
          },
        ],
      }),
    ),
  );
}

function createOutboxWorkers(transport: AsyncTransport, trackers: OwnershipTrackers) {
  return Array.from({ length: CONCURRENCY }, (_, index) =>
    createJobRuntimeOutboxConsumer({
      outbox: transport.outbox,
      ownsWork: true,
      handlers: [
        {
          eventName,
          async handle() {
            trackers.handledOutboxCount += 1;
            trackers.outboxCountsPerReplica[index] += 1;
          },
        },
      ],
    }),
  );
}

async function taskCompletedCount(client: Pick<PoolClient, 'query'>): Promise<number> {
  const result = await client.query(
    'SELECT status, COUNT(*)::int AS cnt FROM task_queue WHERE type = $1 GROUP BY status',
    [taskType],
  );
  return Number(result.rows.find((row) => row.status === 'completed')?.cnt ?? 0);
}

async function outboxCompletedCount(client: Pick<PoolClient, 'query'>): Promise<number> {
  const result = await client.query(
    'SELECT status, COUNT(*)::int AS cnt FROM domain_event_outbox WHERE event_name = $1 GROUP BY status',
    [eventName],
  );
  return Number(result.rows.find((row) => row.status === 'completed')?.cnt ?? 0);
}

async function readCompletion(
  client: Pick<PoolClient, 'query'>,
): Promise<{ completedTasks: number; completedOutbox: number }> {
  const completedTasks = await taskCompletedCount(client);
  const completedOutbox = await outboxCompletedCount(client);
  return { completedTasks, completedOutbox };
}

function isComplete(status: { completedTasks: number; completedOutbox: number }): boolean {
  return status.completedTasks >= SAMPLE_SIZE && status.completedOutbox >= SAMPLE_SIZE;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCompletion(
  client: Pick<PoolClient, 'query'>,
): Promise<{ completedTasks: number; completedOutbox: number }> {
  const deadline = Date.now() + IDLE_TIMEOUT_MS;
  for (;;) {
    const status = await readCompletion(client);
    if (isComplete(status) || Date.now() > deadline) {
      return status;
    }
    await sleep(250);
  }
}

function assertOwnership(
  trackers: OwnershipTrackers,
  completedTasks: number,
  completedOutbox: number,
  taskConsumersLength: number,
  outboxConsumersLength: number,
): void {
  const distinctTaskWorkers = trackers.taskCountsPerReplica.filter((count) => count > 0).length;
  const distinctOutboxWorkers = trackers.outboxCountsPerReplica.filter((count) => count > 0).length;

  console.log(`[cluster-ownership] sample=${SAMPLE_SIZE} task_type=${taskType} event=${eventName}`);
  console.log(
    `[cluster-ownership] worker replicas: task=${taskConsumersLength} outbox=${outboxConsumersLength}`,
  );
  console.log(
    `[cluster-ownership] task completed=${completedTasks} (handled=${trackers.handledTaskIds.size}, dups=${trackers.duplicateTaskIds.length})`,
  );
  console.log(
    `[cluster-ownership] outbox completed=${completedOutbox} (handled=${trackers.handledOutboxCount})`,
  );
  console.log(
    `[cluster-ownership] task workers used=${distinctTaskWorkers} outbox workers used=${distinctOutboxWorkers}`,
  );

  if (CONCURRENCY > 1) {
    assert(distinctTaskWorkers > 1, 'expected more than one worker replica to claim task rows');
    assert(distinctOutboxWorkers > 1, 'expected more than one worker replica to claim outbox rows');
  }
  assert(
    completedTasks === SAMPLE_SIZE,
    `expected all ${SAMPLE_SIZE} tasks completed, got ${completedTasks}`,
  );
  assert(
    completedOutbox === SAMPLE_SIZE,
    `expected all ${SAMPLE_SIZE} outbox events completed, got ${completedOutbox}`,
  );
  assert(
    trackers.handledTaskIds.size === SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} distinct tasks handled, got ${trackers.handledTaskIds.size}`,
  );
  assert(
    trackers.duplicateTaskIds.length === 0,
    `duplicate task consumption: ${trackers.duplicateTaskIds.length}`,
  );
  assert(
    trackers.handledOutboxCount === SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} outbox handled, got ${trackers.handledOutboxCount}`,
  );

  console.log(
    '\n[cluster-ownership] PASS: exactly-once ownership asserted across 2 shared-pool worker replicas',
  );
  console.log(
    '[cluster-ownership] evidence: each task/outbox row processed exactly once under SKIP LOCKED',
  );
  console.log(
    '[cluster-ownership] compose replicas: docker-compose.closeout.yml sets deploy.replicas=2 for candidate-worker and outbox-worker (docker compose up -d --scale candidate-worker=2 --scale outbox-worker=2); this script is the deterministic exactly-once proof on a shared pool (same claim SQL).',
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  const trackers = createOwnershipTrackers();

  await seedRows(pool);

  const transport = createJobRuntimeAsyncTransport({
    config: { asyncTaskTransport: { provider: 'postgres', rabbitmq: null } },
    pool,
  });
  const taskConsumers = await createTaskWorkers(transport, trackers);
  const outboxConsumers = createOutboxWorkers(transport, trackers);

  await Promise.all(taskConsumers.map((consumer) => consumer.run()));
  await Promise.all(outboxConsumers.map((consumer) => consumer.run()));

  const { completedTasks, completedOutbox } = await waitForCompletion(pool);

  await Promise.all(taskConsumers.map((consumer) => consumer.stop()));
  await Promise.all(outboxConsumers.map((consumer) => consumer.stop()));

  await pool.query('DELETE FROM task_queue WHERE type = $1', [taskType]);
  await pool.query('DELETE FROM domain_event_outbox WHERE event_name = $1', [eventName]);

  assertOwnership(
    trackers,
    completedTasks,
    completedOutbox,
    taskConsumers.length,
    outboxConsumers.length,
  );

  await pool.end();
}

main().catch((error) => {
  console.error('[cluster-ownership] FAIL:', error);
  process.exit(1);
});
