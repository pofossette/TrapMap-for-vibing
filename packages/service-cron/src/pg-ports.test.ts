import { describe, expect, it, vi } from 'vitest';

import { createCronOwnerBundle, type Queryable } from './pg-ports.js';

function createPool(overrides: Partial<Queryable> = {}): {
  calls: Array<{ sql: string; values?: unknown[] }>;
  pool: Queryable;
} {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const customQuery = overrides.query;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (customQuery) return customQuery(sql, values);
    return { rows: [] };
  });
  return { calls, pool: { query } };
}

const dueJobRow = {
  id: 'cron_1234567890abcdef',
  name: 'nightly purge',
  schedule: '0 3 * * *',
  timezone: 'UTC',
  task_type: 'purge-expired',
  payload: { days: 30 },
  enabled: true,
  next_run_at: new Date('2026-08-16T03:00:00.000Z'),
  last_run_at: null,
  last_status: null,
  last_error: null,
  run_count: 0,
  created_at: new Date('2026-08-16T00:00:00.000Z'),
  updated_at: new Date('2026-08-16T00:00:00.000Z'),
};

describe('service-cron PostgreSQL owner bundle', () => {
  it('persists a new job with a cron_-prefixed id and a computed initial next run', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes('INSERT INTO cron_jobs')) {
          const v = values ?? [];
          return {
            rows: [
              {
                id: v[0],
                name: v[1],
                schedule: v[2],
                timezone: v[3],
                task_type: v[4],
                payload: v[5],
                enabled: v[6],
                next_run_at: v[7],
                last_run_at: null,
                last_status: null,
                last_error: null,
                run_count: 0,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    });
    const owner = createCronOwnerBundle(pool);

    const job = await owner.create({
      name: 'nightly purge',
      schedule: '0 3 * * *',
      timezone: 'UTC',
      taskType: 'purge-expired',
      payload: { days: 30 },
      enabled: true,
    });

    expect(job.id).toMatch(/^cron_[0-9a-f]{16}$/);
    expect(job.name).toBe('nightly purge');
    expect(job.enabled).toBe(true);
    expect(calls[0]?.sql).toContain('INSERT INTO cron_jobs');
    expect(calls[0]?.sql).toContain('RETURNING');
    expect(calls[0]?.values).toEqual(
      expect.arrayContaining([
        job.id,
        'nightly purge',
        '0 3 * * *',
        'UTC',
        'purge-expired',
        { days: 30 },
        true,
      ]),
    );
    const nextRunAt = calls[0]?.values?.[7];
    expect(nextRunAt).toBeInstanceOf(Date);
    expect((nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an invalid schedule before persisting', async () => {
    const { calls, pool } = createPool();
    const owner = createCronOwnerBundle(pool);

    await expect(
      owner.create({
        name: 'bad',
        schedule: 'not-a-cron',
        timezone: 'UTC',
        taskType: 'purge-expired',
        payload: {},
        enabled: true,
      }),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a schedule with no future run for the given timezone', async () => {
    const { pool } = createPool();
    const owner = createCronOwnerBundle(pool);

    await expect(
      owner.create({
        name: 'bad',
        schedule: '0 0 30 2 *',
        timezone: 'UTC',
        taskType: 'purge-expired',
        payload: {},
        enabled: true,
      }),
    ).rejects.toMatchObject({ kind: 'validation' });
  });

  it('lists jobs ordered by name and maps rows to the cron job contract', async () => {
    const { pool } = createPool({
      query: vi.fn(async () => ({ rows: [dueJobRow] })),
    });
    const owner = createCronOwnerBundle(pool);

    const jobs = await owner.list();
    expect(jobs).toEqual([
      {
        id: 'cron_1234567890abcdef',
        name: 'nightly purge',
        schedule: '0 3 * * *',
        timezone: 'UTC',
        taskType: 'purge-expired',
        payload: { days: 30 },
        enabled: true,
        nextRunAt: '2026-08-16T03:00:00.000Z',
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
    ]);
  });

  it('returns null for a missing job', async () => {
    const owner = createCronOwnerBundle(createPool().pool);
    await expect(owner.getById('cron_missing00000000')).resolves.toBeNull();
  });

  it('recomputes next_run_at when the schedule or timezone is updated and bumps updated_at', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM cron_jobs WHERE id')) return { rows: [dueJobRow] };
        if (sql.includes('UPDATE cron_jobs'))
          return { rows: [{ ...dueJobRow, name: 'renamed', enabled: false }] };
        return { rows: [] };
      }),
    });
    const owner = createCronOwnerBundle(pool);

    const job = await owner.update('cron_1234567890abcdef', {
      schedule: '0 4 * * *',
      timezone: 'UTC',
      name: 'renamed',
      enabled: false,
    });

    expect(job?.name).toBe('renamed');
    const updateCall = calls.find(({ sql }) => sql.includes('UPDATE cron_jobs'));
    expect(updateCall?.sql).toContain('name = $1');
    expect(updateCall?.sql).toContain('schedule = $2');
    expect(updateCall?.sql).toContain('timezone = $3');
    expect(updateCall?.sql).toContain('enabled = $4');
    expect(updateCall?.sql).toContain('next_run_at = $5');
    expect(updateCall?.sql).toContain('updated_at = NOW()');
    expect(updateCall?.values?.[4]).toBeInstanceOf(Date);
  });

  it('passes through partial updates and falls back to the persisted timezone on schedule edits', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM cron_jobs WHERE id')) return { rows: [dueJobRow] };
        if (sql.includes('UPDATE cron_jobs')) return { rows: [dueJobRow] };
        return { rows: [] };
      }),
    });
    const owner = createCronOwnerBundle(pool);

    const timezoneOnly = await owner.update('cron_1234567890abcdef', { timezone: 'Asia/Shanghai' });
    expect(timezoneOnly).not.toBeNull();
    expect(
      calls.some(({ sql }) => sql.includes('UPDATE cron_jobs') && sql.includes('timezone = $1')),
    ).toBe(true);

    const scheduleOnly = await owner.update('cron_1234567890abcdef', { schedule: '0 4 * * *' });
    expect(scheduleOnly).not.toBeNull();
    const scheduleCall = calls.find(({ sql }) => sql.includes('next_run_at = $2'));
    expect(scheduleCall?.sql).toContain('next_run_at = $2');
    expect(scheduleCall?.values?.[1]).toBeInstanceOf(Date);
  });

  it('pauses a job without touching its schedule state', async () => {
    const { calls, pool } = createPool();
    const owner = createCronOwnerBundle(pool);

    await owner.pause('cron_1234567890abcdef');
    expect(calls[0]?.sql).toContain("SET enabled = false");
    expect(calls[0]?.sql).toContain('updated_at = NOW()');
  });

  it('resumes a job by re-enabling it and recomputing next_run_at from now', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM cron_jobs WHERE id')) return { rows: [dueJobRow] };
        if (sql.includes('UPDATE cron_jobs')) return { rows: [dueJobRow] };
        return { rows: [] };
      }),
    });
    const owner = createCronOwnerBundle(pool);

    await owner.resume('cron_1234567890abcdef');
    const updateCall = calls.find(({ sql }) => sql.includes('UPDATE cron_jobs'));
    expect(updateCall?.sql).toContain('enabled = true');
    expect(updateCall?.sql).toContain('next_run_at = $2');
    expect(updateCall?.sql).toContain('updated_at = NOW()');
    expect(updateCall?.values?.[1]).toBeInstanceOf(Date);
  });

  it('deletes a job and reports whether a row was removed', async () => {
    const { pool } = createPool({
      query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    });
    const owner = createCronOwnerBundle(pool);
    await expect(owner.delete('cron_1234567890abcdef')).resolves.toBe(true);

    const { pool: emptyPool } = createPool({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    });
    await expect(createCronOwnerBundle(emptyPool).delete('cron_none')).resolves.toBe(false);
  });

  it('records a manual trigger without advancing next_run_at', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async () => ({ rows: [{ ...dueJobRow, last_run_at: new Date('2026-08-16T09:00:00.000Z'), last_status: 'succeeded' }] })),
    });
    const owner = createCronOwnerBundle(pool);

    const job = await owner.trigger('cron_1234567890abcdef', new Date('2026-08-16T09:00:00.000Z'));
    expect(job?.lastStatus).toBe('succeeded');
    expect(calls[0]?.sql).toContain("last_status = 'succeeded'");
    expect(calls[0]?.sql).not.toContain('next_run_at =');
    expect(calls[0]?.sql).toContain('updated_at = NOW()');
  });

  it('claims only enabled due jobs with a skip-locked atomic claim', async () => {
    const { calls, pool } = createPool({
      query: vi.fn(async () => ({ rows: [dueJobRow] })),
    });
    const owner = createCronOwnerBundle(pool);

    const claimed = await owner.claimDue(new Date('2026-08-16T04:00:00.000Z'), 10);
    expect(claimed).toHaveLength(1);
    expect(calls[0]?.sql).toContain('enabled = true');
    expect(calls[0]?.sql).toContain('next_run_at <= $1');
    expect(calls[0]?.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(calls[0]?.sql).toContain('LIMIT $2');
  });

  it('advances next_run_at on success with an idempotence guard and bumps run_count', async () => {
    const { calls, pool } = createPool();
    const owner = createCronOwnerBundle(pool);

    await owner.applyRunSuccess('cron_1234567890abcdef', {
      nextRunAt: new Date('2026-08-17T03:00:00.000Z'),
      lastRunAt: new Date('2026-08-16T03:00:00.000Z'),
    });
    expect(calls[0]?.sql).toContain('next_run_at = $2');
    expect(calls[0]?.sql).toContain("last_status = 'succeeded'");
    expect(calls[0]?.sql).toContain('run_count = run_count + 1');
    expect(calls[0]?.sql).toContain('updated_at = NOW()');
    expect(calls[0]?.sql).toContain('next_run_at <= $3');
    expect(calls[0]?.sql).toContain('enabled = true');
  });

  it('keeps next_run_at on failure so the job stays due for the next tick', async () => {
    const { calls, pool } = createPool();
    const owner = createCronOwnerBundle(pool);

    await owner.applyRunFailure('cron_1234567890abcdef', {
      lastRunAt: new Date('2026-08-16T03:00:00.000Z'),
      error: 'enqueue failed',
    });
    expect(calls[0]?.sql).toContain("last_status = 'failed'");
    expect(calls[0]?.sql).toContain('last_error = $3');
    expect(calls[0]?.sql).toContain('run_count = run_count + 1');
    expect(calls[0]?.sql).not.toContain('next_run_at =');
    expect(calls[0]?.sql).toContain('updated_at = NOW()');
  });

  it('exposes status snapshots in the shared snapshot shape', async () => {
    const { pool } = createPool({
      query: vi.fn(async () => ({
        rows: [{ ...dueJobRow, last_status: 'succeeded', last_run_at: new Date('2026-08-16T03:00:00.000Z') }],
      })),
    });
    const owner = createCronOwnerBundle(pool);

    const snapshots = await owner.statusSnapshots();
    expect(snapshots).toEqual([
      {
        id: 'cron_1234567890abcdef',
        enabled: true,
        nextRunAt: '2026-08-16T03:00:00.000Z',
        lastRunAt: '2026-08-16T03:00:00.000Z',
        lastStatus: 'succeeded',
        lastError: null,
        runCount: 0,
      },
    ]);
  });
});
