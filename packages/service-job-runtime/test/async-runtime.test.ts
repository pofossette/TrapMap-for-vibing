import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  OUTBOX_CLAIMABLE_SQL_CONDITION,
  OUTBOX_FAIL_STATUS_SQL,
  OUTBOX_RECLAIM_SQL_CONDITION,
  TASK_CLAIMABLE_SQL_CONDITION,
  TASK_DEDUPE_SQL_CONDITION,
  TASK_DEDUPE_TARGET_STATUSES,
  TASK_RECLAIM_SQL_CONDITION,
  TASK_REQUEUE_SQL_CONDITION,
} from '../src/async-runtime.js';
import { createJobRuntimeAsyncTransport, createRabbitMqTaskTransport } from '../src/index.js';

describe('job-runtime SQL condition rendering', () => {
  it('dedupes against pending and running tasks only', () => {
    expect(TASK_DEDUPE_TARGET_STATUSES).toEqual(['pending', 'running']);
    expect(TASK_DEDUPE_SQL_CONDITION).toBe("status IN ('pending', 'running')");
  });

  it('renders authoritative claim, reclaim and requeue SQL conditions', () => {
    expect(TASK_CLAIMABLE_SQL_CONDITION).toBe("status = 'pending' AND process_after <= NOW()");
    expect(TASK_RECLAIM_SQL_CONDITION).toBe("status = 'running' AND lease_until < NOW()");
    expect(TASK_REQUEUE_SQL_CONDITION).toBe("status = 'dead'");
    expect(OUTBOX_CLAIMABLE_SQL_CONDITION).toBe("status = 'pending' AND available_at <= NOW()");
    expect(OUTBOX_RECLAIM_SQL_CONDITION).toBe("status = 'processing' AND lease_until < NOW()");
  });

  it('fails outbox events only after the retry budget is spent', () => {
    expect(OUTBOX_FAIL_STATUS_SQL).toBe("CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END");
  });
});

describe('job-runtime async infrastructure ownership', () => {
  it('creates the owner-local PostgreSQL queue and outbox transport bundle', () => {
    const transport = createJobRuntimeAsyncTransport({
      config: {
        asyncTaskTransport: {
          provider: 'postgres',
          rabbitmq: null,
        },
      },
      pool: {} as Pool,
    });

    expect(transport.task.kind).toBe('postgres-task-queue');
    expect(transport.events.kind).toBe('postgres-domain-outbox');
  });

  it('rejects an incomplete RabbitMQ transport configuration', () => {
    expect(() =>
      createJobRuntimeAsyncTransport({
        config: {
          asyncTaskTransport: {
            provider: 'rabbitmq',
            rabbitmq: null,
          },
        },
        pool: {} as Pool,
      }),
    ).toThrow('RabbitMQ task transport config is required');
  });

  it('owns RabbitMQ task publishing when RabbitMQ is configured', async () => {
    const published: Array<{ exchange: string; routingKey: string; body: string }> = [];
    const channel = {
      assertExchange: () => undefined,
      assertQueue: () => undefined,
      bindQueue: () => undefined,
      prefetch: () => undefined,
      publish: (exchange: string, routingKey: string, body: Buffer) => {
        published.push({ exchange, routingKey, body: body.toString('utf8') });
        return true;
      },
    };

    const transport = createRabbitMqTaskTransport({
      url: 'amqp://guest:guest@localhost:5672',
      exchange: 'trapmap.tasks',
      queue: 'trapmap.candidate',
      prefetch: 4,
      channelFactory: async () => channel,
    });
    const envelope = await transport.enqueue('candidate_processing', { candidateId: 'cand_1' });

    expect(transport.kind).toBe('rabbitmq-task-queue');
    expect(envelope).toMatchObject({ type: 'candidate_processing' });
    expect(published).toEqual([
      expect.objectContaining({ exchange: 'trapmap.tasks', routingKey: 'candidate_processing' }),
    ]);
  });
});
