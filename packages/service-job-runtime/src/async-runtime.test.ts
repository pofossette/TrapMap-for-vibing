import { describe, expect, it } from 'vitest';

import type { Pool } from 'pg';
import { createJobRuntimeAsyncTransport, createRabbitMqTaskTransport } from './index.js';

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
