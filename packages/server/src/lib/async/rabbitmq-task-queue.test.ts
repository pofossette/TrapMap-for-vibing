import { describe, expect, it, vi } from 'vitest';

import { createRabbitMqTaskTransport } from './rabbitmq-task-queue.js';

describe('createRabbitMqTaskTransport', () => {
  it('publishes tasks to RabbitMQ and reports provider kind', async () => {
    const published: Array<{ exchange: string; routingKey: string; body: string }> = [];
    const channel = {
      assertExchange: vi.fn(),
      assertQueue: vi.fn(),
      bindQueue: vi.fn(),
      prefetch: vi.fn(),
      publish: vi.fn((exchange: string, routingKey: string, body: Buffer) => {
        published.push({ exchange, routingKey, body: body.toString('utf8') });
        return true;
      }),
    };

    const transport = createRabbitMqTaskTransport({
      url: 'amqp://guest:guest@localhost:5672',
      exchange: 'trapmap.tasks',
      queue: 'trapmap.candidate',
      prefetch: 4,
      channelFactory: async () => channel as never,
    });

    const envelope = await transport.enqueue('candidate_processing', { candidateId: 'cand_1' });

    expect(transport.kind).toBe('rabbitmq-task-queue');
    expect(envelope.type).toBe('candidate_processing');
    expect(published[0]?.exchange).toBe('trapmap.tasks');
    expect(published[0]?.routingKey).toBe('candidate_processing');
    expect(JSON.parse(published[0]?.body ?? '{}')).toMatchObject({
      type: 'candidate_processing',
      payload: { candidateId: 'cand_1' },
      options: { priority: 0, maxAttempts: 3, delayMs: 0, dedupeKey: null },
    });
  });
});
