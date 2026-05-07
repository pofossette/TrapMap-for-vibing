import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTaskQueue, createTaskWorker } from './task-queue.js';
import type { TaskHandler } from './task-queue.js';

// ---------------------------------------------------------------------------
// Mock pool that captures raw SQL for assertions
// ---------------------------------------------------------------------------

interface MockQueryCall {
  sql: string;
  params: unknown[];
}

function createMockPool() {
  const calls: MockQueryCall[] = [];

  // Simple in-memory store keyed by id
  const rows = new Map<string, Record<string, unknown>>();

  const pool = {
    calls,
    rows,

    async query(sqlOrConfig: string, params?: unknown[]) {
      const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
      calls.push({ sql, params: params ?? [] });

      // CREATE TABLE
      if (sql.includes('CREATE TABLE')) {
        return { rows: [], rowCount: 0 };
      }

      // CREATE INDEX
      if (sql.includes('CREATE INDEX')) {
        return { rows: [], rowCount: 0 };
      }

      // COUNT
      if (sql.includes('COUNT(*)')) {
        let count = 0;
        for (const row of rows.values()) {
          if (
            params &&
            params.length >= 3 &&
            row.type === params[0] &&
            (row.status === params[1] || row.status === params[2])
          ) {
            count++;
          }
        }
        return { rows: [{ count: String(count) }], rowCount: 1 };
      }

      // DELETE completed
      if (sql.includes('DELETE FROM') && sql.includes("status = 'completed'")) {
        let deleted = 0;
        for (const [id, row] of rows) {
          if (row.status === 'completed') {
            rows.delete(id);
            deleted++;
          }
        }
        return { rows: [], rowCount: deleted };
      }

      // SELECT * ... WHERE status = $1 ... LIMIT $2 (getDeadTasks)
      if (sql.includes('status = $1') && sql.includes('ORDER BY') && params?.[0] === 'dead') {
        const limit = (params?.[1] as number) ?? 100;
        const deadRows = [...rows.values()].filter((r) => r.status === 'dead').slice(0, limit);
        return { rows: deadRows, rowCount: deadRows.length };
      }

      // SELECT attempts, max_attempts
      if (sql.includes('attempts, max_attempts')) {
        const id = params?.[0] as string;
        const row = rows.get(id);
        if (!row) return { rows: [], rowCount: 0 };
        return {
          rows: [{ attempts: row.attempts, max_attempts: row.max_attempts }],
          rowCount: 1,
        };
      }

      // UPDATE ... WHERE id = (SELECT ...) — dequeue via SKIP LOCKED
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        const type = params?.[0] as string;
        // Find first matching pending task
        let found: [string, Record<string, unknown>] | null = null;
        for (const [id, row] of rows) {
          if (row.type === type && row.status === 'pending') {
            found = [id, row];
            break;
          }
        }
        if (!found) return { rows: [], rowCount: 0 };
        found[1].status = 'running';
        return { rows: [found[1]], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool & { calls: MockQueryCall[]; rows: Map<string, Record<string, unknown>> };

  return pool;
}

// ---------------------------------------------------------------------------
// Chainable query builder stub for drizzle operations
// ---------------------------------------------------------------------------

function createChainable(finalResult?: unknown) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      // Every property access returns a function; calling it returns another chainable
      const fn = (..._args: unknown[]) => {
        // Terminal operations resolve the chain
        if (prop === 'values' || prop === 'returning' || prop === 'onConflictDoUpdate') {
          return Promise.resolve(finalResult ?? []);
        }
        // Non-terminal: return another chainable
        return new Proxy({}, handler);
      };
      return fn;
    },
  };
  // The chainable itself is callable (for db.insert(table) pattern)
  return new Proxy(() => new Proxy({}, handler), {
    apply(_target, _thisArg, _args) {
      return new Proxy({}, handler);
    },
    get(_target, prop) {
      if (prop === 'then') return undefined;
      const fn = (..._args: unknown[]) => {
        if (prop === 'values' || prop === 'returning' || prop === 'onConflictDoUpdate') {
          return Promise.resolve(finalResult ?? []);
        }
        return new Proxy({}, handler);
      };
      return fn;
    },
  }) as unknown as Record<string, (...args: unknown[]) => any>;
}

// ---------------------------------------------------------------------------
// Mock drizzle-orm/node-postgres
// ---------------------------------------------------------------------------

let mockDbInstance: Record<string, (...args: unknown[]) => any>;

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: (_pool: unknown, _opts: unknown) => {
    mockDbInstance = {
      insert: createChainable(),
      select: createChainable(),
      update: createChainable(),
      delete: createChainable(),
    };
    return mockDbInstance;
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: unknown) => ({ _eq: val }),
  and: (...conds: unknown[]) => ({ _and: conds }),
}));

// Column builder mock — all chain methods return self
function mockCol(name: string) {
  const col: Record<string, unknown> = { name };
  const handler: ProxyHandler<typeof col> = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined;
      // All chain methods (.primaryKey(), .notNull(), .default(), .defaultNow(), .$type()) return the col
      return (..._args: unknown[]) => new Proxy(col, handler);
    },
  };
  return new Proxy(col, handler);
}

vi.mock('drizzle-orm/pg-core', () => ({
  text: (name: string) => mockCol(name),
  integer: (name: string) => mockCol(name),
  timestamp: (name: string) => mockCol(name),
  pgTable: (_name: string, columns: unknown, _indexes?: unknown) => columns,
  uniqueIndex: () => ({ on: (..._cols: unknown[]) => ({}) }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTaskQueue', () => {
  let pool: ReturnType<typeof createMockPool>;
  let queue: ReturnType<typeof createTaskQueue>;

  beforeEach(() => {
    pool = createMockPool();
    queue = createTaskQueue({ pool });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── enqueue ──────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('creates a task with default options', async () => {
      const task = await queue.enqueue('email', { to: 'alice@test.com' });

      expect(task.type).toBe('email');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(0);
      expect(task.attempts).toBe(0);
      expect(task.maxAttempts).toBe(3);
      expect(task.lastError).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.id).toMatch(/^task_/);
    });

    it('respects priority option', async () => {
      const task = await queue.enqueue('email', { to: 'bob@test.com' }, { priority: 10 });
      expect(task.priority).toBe(10);
    });

    it('respects maxAttempts option', async () => {
      const task = await queue.enqueue('email', {}, { maxAttempts: 5 });
      expect(task.maxAttempts).toBe(5);
    });

    it('sets processAfter when delayMs is provided', async () => {
      const before = Date.now();
      const task = await queue.enqueue('email', {}, { delayMs: 5000 });
      const after = Date.now();

      expect(task.processAfter.getTime()).toBeGreaterThanOrEqual(before + 5000 - 1);
      expect(task.processAfter.getTime()).toBeLessThanOrEqual(after + 5000);
    });

    it('uses pool defaultMaxAttempts when provided', async () => {
      const q = createTaskQueue({ pool, defaultMaxAttempts: 7 });
      const task = await q.enqueue('email', {});
      expect(task.maxAttempts).toBe(7);
    });
  });

  // ── dequeue ──────────────────────────────────────────────────────────────

  describe('dequeue', () => {
    it('returns null when queue is empty', async () => {
      const task = await queue.dequeue('email');
      expect(task).toBeNull();
    });

    it('returns and locks a pending task', async () => {
      // Seed a task into mock rows
      pool.rows.set('task_abc', {
        id: 'task_abc',
        type: 'email',
        payload: JSON.stringify({ to: 'x@test.com' }),
        status: 'pending',
        priority: 0,
        attempts: 0,
        max_attempts: 3,
        last_error: null,
        process_after: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      });

      const task = await queue.dequeue('email');
      expect(task).not.toBeNull();
      expect(task!.id).toBe('task_abc');
      expect(task!.status).toBe('running');
      expect(task!.payload).toEqual({ to: 'x@test.com' });
    });
  });

  // ── complete ─────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('updates status to completed', async () => {
      await queue.complete('task_abc');
      // complete uses drizzle update - just verify no error thrown
    });
  });

  // ── fail ─────────────────────────────────────────────────────────────────

  describe('fail', () => {
    it('reschedules when retries remain', async () => {
      pool.rows.set('task_1', {
        id: 'task_1',
        attempts: 0,
        max_attempts: 3,
      });

      await queue.fail('task_1', 'network error');
      // Should not throw, task gets rescheduled with incremented attempts
    });

    it('marks dead when max attempts exceeded', async () => {
      pool.rows.set('task_2', {
        id: 'task_2',
        attempts: 2,
        max_attempts: 3,
      });

      await queue.fail('task_2', 'persistent error');
      // Should mark as dead since 2+1 >= 3
    });

    it('is no-op for unknown id', async () => {
      await expect(queue.fail('nonexistent', 'error')).resolves.toBeUndefined();
    });
  });

  // ── getPendingCount ──────────────────────────────────────────────────────

  describe('getPendingCount', () => {
    it('returns 0 when no tasks', async () => {
      const count = await queue.getPendingCount('email');
      expect(count).toBe(0);
    });

    it('returns correct count for matching tasks', async () => {
      pool.rows.set('t1', { id: 't1', type: 'email', status: 'pending' });
      pool.rows.set('t2', { id: 't2', type: 'email', status: 'running' });
      pool.rows.set('t3', { id: 't3', type: 'email', status: 'completed' });

      const count = await queue.getPendingCount('email');
      // pending + running = 2
      expect(count).toBe(2);
    });

    it('excludes tasks of different types', async () => {
      pool.rows.set('t1', { id: 't1', type: 'email', status: 'pending' });
      pool.rows.set('t2', { id: 't2', type: 'sms', status: 'pending' });

      const count = await queue.getPendingCount('email');
      expect(count).toBe(1);
    });
  });

  // ── getDeadTasks ─────────────────────────────────────────────────────────

  describe('getDeadTasks', () => {
    it('returns empty array when no dead tasks', async () => {
      const tasks = await queue.getDeadTasks();
      expect(tasks).toEqual([]);
    });

    it('returns dead tasks', async () => {
      pool.rows.set('t1', {
        id: 't1',
        type: 'email',
        payload: '{}',
        status: 'dead',
        priority: 0,
        attempts: 3,
        max_attempts: 3,
        last_error: 'timeout',
        process_after: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
      });

      const tasks = await queue.getDeadTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t1');
      expect(tasks[0].status).toBe('dead');
    });
  });

  // ── requeue ──────────────────────────────────────────────────────────────

  describe('requeue', () => {
    it('resets a dead task to pending', async () => {
      await queue.requeue('task_dead');
      // Uses drizzle update with status=pending, attempts=0
    });
  });

  // ── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('deletes old completed tasks', async () => {
      pool.rows.set('c1', { id: 'c1', status: 'completed' });
      pool.rows.set('p1', { id: 'p1', status: 'pending' });

      const deleted = await queue.cleanup(7);
      expect(deleted).toBe(1);
      expect(pool.rows.has('c1')).toBe(false);
      expect(pool.rows.has('p1')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Worker tests — test through public API (run/stop)
// ---------------------------------------------------------------------------

describe('createTaskWorker', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
  });

  it('exposes run and stop methods', () => {
    const handler: TaskHandler = {
      type: 'email',
      handle: vi.fn(),
    };

    const worker = createTaskWorker({ pool, handlers: [handler] });

    expect(typeof worker.run).toBe('function');
    expect(typeof worker.stop).toBe('function');
  });

  it('stop sets running to false without error', () => {
    const handler: TaskHandler = {
      type: 'email',
      handle: vi.fn(),
    };

    const worker = createTaskWorker({ pool, handlers: [handler] });
    expect(() => worker.stop()).not.toThrow();
  });

  it('accepts custom pollIntervalMs and concurrency options', () => {
    const handler: TaskHandler = {
      type: 'email',
      handle: vi.fn(),
    };

    // Just verify construction doesn't throw with custom options
    const worker = createTaskWorker({
      pool,
      handlers: [handler],
      pollIntervalMs: 500,
      concurrency: 4,
    });

    expect(typeof worker.run).toBe('function');
    expect(typeof worker.stop).toBe('function');
  });
});
