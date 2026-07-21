import { describe, expect, it, vi } from 'vitest';

import { createJobRuntimeOutboxConsumer } from './outbox-worker.js';

describe('job-runtime outbox consumer', () => {
  it('completes a matching event through its owner-local handler', async () => {
    const complete = vi.fn(async () => undefined);
    const handle = vi.fn(async () => undefined);
    const consumer = createJobRuntimeOutboxConsumer({
      outbox: {
        kind: 'postgres-domain-outbox',
        claimBatch: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'evt_1',
              eventName: 'knowledge.approved',
              payload: { id: 'k1' },
              aggregateId: 'k1',
            },
          ])
          .mockResolvedValue([]),
        complete,
        fail: vi.fn(async () => undefined),
        enqueue: vi.fn(async () => undefined),
        getStatusSnapshot: vi.fn(async () => ({
          provider: 'postgres',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          reclaimCount: 0,
        })),
      },
      handlers: [{ eventName: 'knowledge.approved', handle }],
      ownsWork: true,
      pollIntervalMs: 10_000,
    });

    await consumer.run();
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith('evt_1'));
    await consumer.stop();

    expect(handle).toHaveBeenCalledWith({ id: 'k1' });
  });

  it('fails a handler error and reports it', async () => {
    const error = new Error('governance unavailable');
    const fail = vi.fn(async () => undefined);
    const onError = vi.fn();
    const consumer = createJobRuntimeOutboxConsumer({
      outbox: {
        kind: 'postgres-domain-outbox',
        claimBatch: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 'evt_2', eventName: 'knowledge.approved', payload: {}, aggregateId: 'k2' },
          ])
          .mockResolvedValue([]),
        complete: vi.fn(async () => undefined),
        fail,
        enqueue: vi.fn(async () => undefined),
        getStatusSnapshot: vi.fn(async () => ({
          provider: 'postgres',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          reclaimCount: 0,
        })),
      },
      handlers: [
        {
          eventName: 'knowledge.approved',
          handle: async () => {
            throw error;
          },
        },
      ],
      ownsWork: true,
      pollIntervalMs: 10_000,
      onError,
    });

    await consumer.run();
    await vi.waitFor(() => expect(fail).toHaveBeenCalledWith('evt_2', 'governance unavailable'));
    await consumer.stop();

    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ aggregateId: 'k2' }));
  });

  it('stops an idle poll without waiting for the poll interval', async () => {
    const consumer = createJobRuntimeOutboxConsumer({
      outbox: {
        kind: 'postgres-domain-outbox',
        claimBatch: vi.fn(async () => []),
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
        enqueue: vi.fn(async () => undefined),
        getStatusSnapshot: vi.fn(async () => ({
          provider: 'postgres',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          reclaimCount: 0,
        })),
      },
      handlers: [],
      ownsWork: true,
      pollIntervalMs: 10_000,
    });

    await consumer.run();
    await expect(
      Promise.race([
        consumer.stop().then(() => 'stopped'),
        new Promise((resolve) => setTimeout(() => resolve('timed-out'), 25)),
      ]),
    ).resolves.toBe('stopped');
  });
});
