import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createTaskWorker } from './task-worker.js';

describe('task worker shutdown', () => {
  it('does not poll again after stop is requested during dequeue', async () => {
    let resolveDequeue: ((value: { rows: never[]; rowCount: number }) => void) | undefined;
    let dequeueCalls = 0;
    let poolClosed = false;
    const query = vi.fn((sql: string) => {
      if (sql.includes('lease_until IS NOT NULL')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes('RETURNING *')) {
        dequeueCalls += 1;
        if (dequeueCalls === 1) {
          return new Promise<{ rows: never[]; rowCount: number }>((resolve) => {
            resolveDequeue = resolve;
          });
        }
        if (poolClosed) {
          return Promise.reject(new Error('pool closed'));
        }
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const pool = { query } as unknown as Pool;
    const worker = createTaskWorker({
      pool,
      handlers: [{ type: 'test', handle: async () => {} }],
      pollIntervalMs: 0,
    });

    const runPromise = worker.run();
    await vi.waitFor(() => expect(dequeueCalls).toBe(1));
    const stopPromise = worker.stop();
    poolClosed = true;
    resolveDequeue?.({ rows: [], rowCount: 0 });

    await expect(stopPromise).resolves.toBeUndefined();
    await expect(runPromise).resolves.toBeUndefined();
    expect(dequeueCalls).toBe(1);
  });
});
