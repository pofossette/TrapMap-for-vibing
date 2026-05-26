/**
 * Tests for PostgreSQL-backed task queue.
 *
 * Uses mock pool to verify:
 * - Enqueue creates tasks with correct fields including dedupeKey
 * - Dequeue respects priority DESC, created_at ASC ordering
 * - Dequeue respects process_after (delayed tasks not visible)
 * - Dequeue uses SKIP LOCKED for concurrent safety
 * - Complete marks task as completed
 * - Fail reschedules with exponential backoff
 * - Fail moves to dead after max attempts
 * - Requeue returns dead tasks to pending
 * - getPendingCount / getDeadTasks / cleanup
 */

import { describe, expect, it } from 'vitest';

import { createTaskQueue } from './task-queue.js';

// ---------------------------------------------------------------------------
// Test helpers — in-memory mock that simulates PostgreSQL behavior
// ---------------------------------------------------------------------------

interface MockTaskRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  dedupe_key: string | null;
  process_after: Date;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

function makeRow(id: string, overrides: Partial<MockTaskRow> = {}): MockTaskRow {
  const now = new Date();
  return {
    id,
    type: 'test',
    payload: '{}',
    status: 'pending',
    priority: 0,
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    dedupe_key: null,
    process_after: new Date(now.getTime() - 10000),
    created_at: now,
    updated_at: now,
    completed_at: null,
    ...overrides,
  };
}

function buildMockPool(initialRows: MockTaskRow[] = []) {
  const rows: MockTaskRow[] = initialRows.map((r) => ({ ...r }));

  const query = async (...args: any[]): Promise<{ rows: any[]; rowCount: number }> => {
    let sql: string;
    let params: unknown[];

    if (typeof args[0] === 'string') {
      sql = args[0];
      params = (args[1] as unknown[]) ?? [];
    } else if (args[0] && typeof args[0] === 'object') {
      sql = String(args[0].text ?? args[0].sql ?? '');
      params = (args[1] as unknown[]) ?? [];
    } else {
      sql = String(args[0] ?? '');
      params = (args[1] as unknown[]) ?? [];
    }

    const sqlL = sql.toLowerCase();

    // INSERT — track the row in-memory
    if (sqlL.includes('insert into "task_queue"')) {
      // Drizzle parameterized: $1=id, $2=type, $3=payload, $4=status, $5=priority,
      //   $6=attempts, $7=max_attempts, $8=dedupe_key, $9=process_after
      const now = new Date();
      const row: MockTaskRow = {
        id: (params?.[0] as string) ?? '',
        type: (params?.[1] as string) ?? '',
        payload: (params?.[2] as string) ?? '{}',
        status: (params?.[3] as string) ?? 'pending',
        priority: (params?.[4] as number) ?? 0,
        attempts: (params?.[5] as number) ?? 0,
        max_attempts: (params?.[6] as number) ?? 3,
        last_error: null,
        dedupe_key: (params?.[7] as string) ?? null,
        process_after: (params?.[8] as Date) ?? now,
        created_at: now,
        updated_at: now,
        completed_at: null,
      };
      rows.push(row);
      return { rows: [], rowCount: 1 };
    }

    // Dequeue: UPDATE ... FOR UPDATE SKIP LOCKED (must be BEFORE general UPDATE)
    if (sqlL.includes('for update skip locked')) {
      const type = params?.[0] as string;
      const now = new Date();
      const candidates = rows
        .filter(
          (r) =>
            r.type === type &&
            r.status === 'pending' &&
            r.process_after.getTime() <= now.getTime(),
        )
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.created_at.getTime() - b.created_at.getTime();
        });

      const selected = candidates[0];
      if (selected) {
        selected.status = 'running';
        selected.updated_at = new Date();
        return { rows: [selected], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // UPDATE — apply status changes (regular Drizzle UPDATE, not dequeue)
    if (sqlL.includes('update')) {
      // Use the first SET value (params[0] with Drizzle) to determine action
      const setStatus = params?.[0] as string | undefined;
      const setComplete = sqlL.includes('"completed_at"');
      const setDead = setStatus === 'dead' && !setComplete;
      const setPending = setStatus === 'pending' && !setComplete;
      // Extract task id — it's a string starting with 'task_' among the params
      const taskId = (
        params?.find((p) => typeof p === 'string' && p.startsWith('task_')) ?? ''
      ) as string;

      const row = rows.find((r) => r.id === taskId);
      if (row) {
        if (setComplete) {
          row.status = 'completed';
          row.completed_at = new Date();
        } else if (setDead) {
          row.status = 'dead';
          row.attempts = Number(params?.find((p, i) => i === 1)) ?? row.attempts;
          row.last_error = params?.find((p) => typeof p === 'string' && !p.startsWith('task_')) as string ?? row.last_error;
        } else if (setPending) {
          row.status = 'pending';
          row.attempts = Number(params?.find((p, i) => i === 1)) ?? 0;
          row.last_error = null;
          // process_after is at index 3 after status($0), attempts($1), last_error($2)
          const paVal = params?.[3];
          row.process_after = paVal instanceof Date ? paVal : new Date(String(paVal ?? Date.now()));
        }
        row.updated_at = new Date();
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }

    // fail() reads attempts before update — handle unquoted column names
    if (sqlL.includes('select') && (sqlL.includes('attempts') || sqlL.includes('"attempts"')) && sqlL.includes('max_attempts')) {
      const taskId = params?.[0] as string;
      const row = rows.find((r) => r.id === taskId);
      if (row) {
        return { rows: [{ attempts: row.attempts, max_attempts: row.max_attempts }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // getPendingCount
    if (sqlL.includes('select count')) {
      const type = params?.[0] as string;
      const count = rows.filter(
        (r) => r.type === type && (r.status === 'pending' || r.status === 'running'),
      ).length;
      return { rows: [{ count: String(count) }], rowCount: 1 };
    }

    // getDeadTasks
    if (sqlL.includes('select *') && sqlL.includes('order by') && sqlL.includes('limit')) {
      // SQL: SELECT * FROM task_queue WHERE status = $1 ORDER BY created_at DESC LIMIT $2
      // Check if the first param is 'dead' to distinguish from other SELECT queries
      const statusParam = params?.[0] as string;
      if (statusParam !== 'dead' && !sqlL.includes('dead')) {
        // Not a getDeadTasks query — let other handlers try
      } else {
        const limit = (params?.[1] as number) ?? 100;
        const dead = rows
          .filter((r) => r.status === 'dead')
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, limit);
        return { rows: dead, rowCount: dead.length };
      }
    }

    // cleanup
    if (sqlL.includes('delete from')) {
      // Remove completed rows older than retention
      const idxsToRemove: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        if (r.status === 'completed') {
          idxsToRemove.push(i);
        }
      }
      const removed = idxsToRemove.length;
      for (let i = idxsToRemove.length - 1; i >= 0; i--) {
        rows.splice(idxsToRemove[i]!, 1);
      }
      return { rows: [], rowCount: removed };
    }

    return { rows: [], rowCount: 0 };
  };

  return {
    query,
    connect: () => Promise.resolve({ query, release: () => {} }),
    end: () => Promise.resolve(),
    getRows: () => rows,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTaskQueue', () => {
  describe('enqueue', () => {
    it('should create a task and return it with correct fields', async () => {
      const mock = buildMockPool();
      const queue = createTaskQueue({ pool: mock as any });

      const task = await queue.enqueue('candidate_processing', { candidateId: 'abc' }, {
        priority: 5,
        maxAttempts: 2,
      });

      expect(task.type).toBe('candidate_processing');
      expect(task.payload).toEqual({ candidateId: 'abc' });
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(5);
      expect(task.maxAttempts).toBe(2);
      expect(task.attempts).toBe(0);
      expect(task.lastError).toBeNull();
      expect(task.dedupeKey).toBeNull();
      expect(task.processAfter).toBeInstanceOf(Date);
      expect(task.id).toMatch(/^task_/);

      // Verify row persisted in mock store
      expect(mock.getRows().length).toBe(1);
      expect(mock.getRows()[0]!.type).toBe('candidate_processing');
    });

    it('should set dedupeKey when provided', async () => {
      const mock = buildMockPool();
      const queue = createTaskQueue({ pool: mock as any });

      const task = await queue.enqueue('candidate_processing', { candidateId: 'abc' }, {
        dedupeKey: 'candidate_abc',
      });

      expect(task.dedupeKey).toBe('candidate_abc');
      expect(mock.getRows()[0]!.dedupe_key).toBe('candidate_abc');
    });

    it('should honour delayMs for processAfter', async () => {
      const mock = buildMockPool();
      const queue = createTaskQueue({ pool: mock as any });
      const before = Date.now();

      const task = await queue.enqueue('candidate_processing', { candidateId: 'abc' }, {
        delayMs: 5000,
      });

      expect(task.processAfter.getTime()).toBeGreaterThanOrEqual(before + 5000);
    });
  });

  describe('dequeue ordering', () => {
    it('should dequeue highest priority first', async () => {
      const rows = [
        makeRow('task_1', { priority: 0, created_at: new Date(Date.now() - 5000) }),
        makeRow('task_2', { priority: 10, created_at: new Date(Date.now() - 4000) }),
        makeRow('task_3', { priority: 5, created_at: new Date(Date.now() - 3000) }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const t1 = await queue.dequeue('test');
      expect(t1!.id).toBe('task_2');
      expect(t1!.priority).toBe(10);

      const t2 = await queue.dequeue('test');
      expect(t2!.id).toBe('task_3');

      const t3 = await queue.dequeue('test');
      expect(t3!.id).toBe('task_1');
    });

    it('should dequeue by created_at ASC when priority is equal', async () => {
      const rows = [
        makeRow('task_later', { created_at: new Date(Date.now() - 3000) }),
        makeRow('task_earlier', { created_at: new Date(Date.now() - 5000) }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const task = await queue.dequeue('test');
      expect(task!.id).toBe('task_earlier');
    });

    it('should not dequeue tasks with process_after in the future', async () => {
      const futureTime = new Date(Date.now() + 60000);
      const rows = [
        makeRow('task_delayed', { priority: 10, process_after: futureTime }),
        makeRow('task_ready', { priority: 0 }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const task = await queue.dequeue('test');
      expect(task!.id).toBe('task_ready');
    });

    it('should not dequeue non-pending tasks', async () => {
      const rows = [
        makeRow('task_running', { status: 'running' }),
        makeRow('task_completed', { status: 'completed' }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const task = await queue.dequeue('test');
      expect(task).toBeNull();
    });

    it('should return null when no tasks match type', async () => {
      const mock = buildMockPool();
      const queue = createTaskQueue({ pool: mock as any });

      const task = await queue.dequeue('nonexistent');
      expect(task).toBeNull();
    });
  });

  describe('complete', () => {
    it('should mark task as completed', async () => {
      const rows = [makeRow('task_1', { status: 'running' })];
      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      await queue.complete('task_1');

      const stored = mock.getRows()[0];
      expect(stored!.status).toBe('completed');
      expect(stored!.completed_at).toBeDefined();
    });
  });

  describe('fail and retry', () => {
    it('should reschedule task with backoff on first failure', async () => {
      const rows = [makeRow('task_1', { status: 'running', attempts: 0, max_attempts: 3 })];
      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      await queue.fail('task_1', 'Test error');

      const stored = mock.getRows()[0];
      expect(stored!.status).toBe('pending');
      // After backoff, processAfter should be in the future
      expect(stored!.process_after.getTime()).toBeGreaterThan(Date.now());
    });

    it('should move task to dead after exceeding max attempts', async () => {
      const rows = [makeRow('task_1', { status: 'running', attempts: 2, max_attempts: 3 })];
      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      await queue.fail('task_1', 'Final error');

      const stored = mock.getRows()[0];
      // Drizzle update will set dead status (attempts 2 + 1 >= max_attempts 3)
      // Our mock applies the status from params
      expect(stored!.status).toBe('dead');
    });
  });

  describe('requeue', () => {
    it('should reset dead task to pending', async () => {
      const rows = [makeRow('task_1', { status: 'dead', attempts: 3 })];
      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      await queue.requeue('task_1');

      const stored = mock.getRows()[0];
      expect(stored!.status).toBe('pending');
    });
  });

  describe('getPendingCount', () => {
    it('should count pending and running tasks', async () => {
      const rows = [
        makeRow('task_1', { status: 'pending' }),
        makeRow('task_2', { status: 'running' }),
        makeRow('task_3', { status: 'completed' }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const count = await queue.getPendingCount('test');
      expect(count).toBe(2);
    });

    it('should return 0 for no matches', async () => {
      const mock = buildMockPool();
      const queue = createTaskQueue({ pool: mock as any });

      const count = await queue.getPendingCount('test');
      expect(count).toBe(0);
    });
  });

  describe('getDeadTasks', () => {
    it('should return dead tasks ordered by created_at DESC', async () => {
      const oldDate = new Date(Date.now() - 10000);
      const newDate = new Date(Date.now() - 1000);
      const rows = [
        makeRow('task_older', { status: 'dead', created_at: oldDate }),
        makeRow('task_newer', { status: 'dead', created_at: newDate }),
      ];

      const mock = buildMockPool(rows);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const dead = await queue.getDeadTasks();
      expect(dead.length).toBe(2);
      expect(dead[0]!.id).toBe('task_newer');
      expect(dead[1]!.id).toBe('task_older');
    });
  });

  describe('cleanup', () => {
    it('should remove completed tasks', async () => {
      const mock = buildMockPool([
        makeRow('task_completed', { status: 'completed' }),
        makeRow('task_pending', { status: 'pending' }),
      ]);
      const pool = { query: mock.query };
      const queue = createTaskQueue({ pool: pool as any });

      const deleted = await queue.cleanup(7);
      expect(deleted).toBe(1);
      expect(mock.getRows().length).toBe(1);
      expect(mock.getRows()[0]!.id).toBe('task_pending');
    });
  });
});
