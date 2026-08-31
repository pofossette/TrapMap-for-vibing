import { describe, expect, it, vi } from 'vitest';

import { createCandidateProcessingTaskQueue } from '../src/processing-task-queue.js';

const CANDIDATE_PROCESSING = 'candidate_processing';
const POLL_INTERVAL_MS = 100;

type StoredTask = {
  attempts: number;
  id: string;
  maxAttempts: number;
  payload: unknown;
  processAfter: number;
  status: 'completed' | 'pending' | 'running';
  type: string;
};

function createPool() {
  const tasks: StoredTask[] = [];

  const pool = {
    query: vi.fn(async <Row extends Record<string, unknown>>(sql: string, values?: unknown[]) => {
      if (sql.includes('INSERT INTO task_queue')) {
        const [id, type, serializedPayload, , maxAttempts] = values ?? [];
        tasks.push({
          id: String(id),
          type: String(type),
          payload: JSON.parse(String(serializedPayload)),
          status: 'pending',
          attempts: 0,
          maxAttempts: Number(maxAttempts),
          processAfter: Date.now(),
        });
        return { rows: [{ id }] } as { rows: Row[] };
      }

      if (sql.includes("SET status = 'running'")) {
        const types = (values?.[0] as string[]) ?? [];
        const task = tasks.find(
          (candidate) =>
            candidate.status === 'pending' &&
            candidate.processAfter <= Date.now() &&
            types.includes(candidate.type),
        );
        if (!task) return { rows: [] } as { rows: Row[] };
        task.status = 'running';
        task.attempts += 1;
        return {
          rows: [
            {
              id: task.id,
              type: task.type,
              payload: task.payload,
              attempts: task.attempts,
              max_attempts: task.maxAttempts,
            },
          ],
        } as { rows: Row[] };
      }

      const task = tasks.find((candidate) => candidate.id === values?.[0]);
      if (sql.includes("SET status = 'completed'")) {
        if (task) task.status = 'completed';
      } else if (sql.includes('SET status = $2')) {
        if (task) {
          task.status = values?.[1] === 'dead' ? 'completed' : 'pending';
          task.processAfter = Date.now() + 5_000;
        }
      }
      return { rows: [] } as { rows: Row[] };
    }),
  };

  return { pool, tasks };
}

describe('candidate processing task queue', () => {
  it('claims a task enqueued after its initial empty poll', async () => {
    vi.useFakeTimers();
    const { pool } = createPool();
    const queue = createCandidateProcessingTaskQueue(pool);
    const handle = vi.fn(async () => undefined);
    const consumer = await queue.createConsumer?.({
      ownsWork: true,
      handlers: [{ type: CANDIDATE_PROCESSING, handle }],
    });
    if (!consumer) throw new Error('Expected queue consumer');

    const running = consumer.run();
    await vi.advanceTimersByTimeAsync(0);
    await queue.enqueue(CANDIDATE_PROCESSING, { candidateId: 'candidate-1' });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { candidateId: 'candidate-1' } }),
      expect.any(AbortSignal),
    );

    await consumer.stop();
    await running;
    vi.useRealTimers();
  });

  it('reclaims a failed task after its five-second retry delay', async () => {
    vi.useFakeTimers();
    const { pool } = createPool();
    const queue = createCandidateProcessingTaskQueue(pool);
    const handle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(undefined);
    const consumer = await queue.createConsumer?.({
      ownsWork: true,
      handlers: [{ type: CANDIDATE_PROCESSING, handle }],
    });
    if (!consumer) throw new Error('Expected queue consumer');

    await queue.enqueue(CANDIDATE_PROCESSING, { candidateId: 'candidate-1' });
    const running = consumer.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(handle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000 + POLL_INTERVAL_MS);
    expect(handle).toHaveBeenCalledTimes(2);

    await consumer.stop();
    await running;
    vi.useRealTimers();
  });
});
