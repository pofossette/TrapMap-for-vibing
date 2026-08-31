/**
 * Cron job registry — PostgreSQL owner bundle.
 *
 * All cron_jobs SQL lives here; the scheduler and routes never touch the
 * database directly. Row mapping is snake_case -> camelCase with timestamps
 * normalized to ISO strings, mirroring the other service owner bundles.
 */

import { InvocationError, computeNextRun } from '@trapmap/backend-core';
import type {
  CronJob,
  CronJobCreateInput,
  CronJobStatusSnapshot,
  CronJobUpdateInput,
} from '@trapmap/contracts';
import { cronValidate, prefixedId } from '@trapmap/lib';
import { cronJobs } from '@trapmap/db';
import { getTableName } from 'drizzle-orm';

const cronJobsTable = getTableName(cronJobs);

export type Queryable = {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number }>;
};

type CronJobRow = Record<string, unknown>;

const CRON_JOB_COLUMNS =
  'id, name, schedule, timezone, task_type, payload, enabled, next_run_at, last_run_at, last_status, last_error, run_count, created_at, updated_at';

const CRON_JOB_STATUS_COLUMNS =
  'id, enabled, next_run_at, last_run_at, last_status, last_error, run_count';

export interface CronOwnerBundle {
  create(input: CronJobCreateInput): Promise<CronJob>;
  list(): Promise<CronJob[]>;
  getById(id: string): Promise<CronJob | null>;
  update(id: string, input: CronJobUpdateInput): Promise<CronJob | null>;
  pause(id: string): Promise<CronJob | null>;
  resume(id: string): Promise<CronJob | null>;
  delete(id: string): Promise<boolean>;
  trigger(id: string, now: Date): Promise<CronJob | null>;
  statusSnapshots(): Promise<CronJobStatusSnapshot[]>;
  claimDue(now: Date, limit?: number): Promise<CronJob[]>;
  applyRunSuccess(id: string, params: { nextRunAt: Date; lastRunAt: Date }): Promise<void>;
  applyRunFailure(id: string, params: { lastRunAt: Date; error: string }): Promise<void>;
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToCronJob(row: CronJobRow): CronJob {
  return {
    id: String(row.id),
    name: String(row.name),
    schedule: String(row.schedule),
    timezone: String(row.timezone),
    taskType: String(row.task_type),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    enabled: Boolean(row.enabled),
    nextRunAt: asIso(row.next_run_at),
    lastRunAt: asIso(row.last_run_at),
    lastStatus: (row.last_status as CronJob['lastStatus']) ?? null,
    lastError: row.last_error == null ? null : String(row.last_error),
    runCount: Number(row.run_count ?? 0),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: asIso(row.updated_at) ?? new Date().toISOString(),
  };
}

function rowToStatusSnapshot(row: CronJobRow): CronJobStatusSnapshot {
  return {
    id: String(row.id),
    enabled: Boolean(row.enabled),
    nextRunAt: asIso(row.next_run_at),
    lastRunAt: asIso(row.last_run_at),
    lastStatus: (row.last_status as CronJobStatusSnapshot['lastStatus']) ?? null,
    lastError: row.last_error == null ? null : String(row.last_error),
    runCount: Number(row.run_count ?? 0),
  };
}

/** Validate a cron expression and compute its next occurrence; rejects with a 400-wire error. */
function nextRunOrThrow(schedule: string, from: Date, timezone: string): Date {
  if (!cronValidate(schedule)) {
    throw InvocationError.validation(`Invalid cron schedule expression: ${schedule}`);
  }
  try {
    return computeNextRun(schedule, from, timezone);
  } catch (error) {
    throw InvocationError.validation(
      `Invalid cron schedule/timezone: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const CRON_JOB_UPDATE_COLUMNS: ReadonlyArray<readonly [keyof CronJobUpdateInput, string]> = [
  ['name', 'name'],
  ['schedule', 'schedule'],
  ['timezone', 'timezone'],
  ['taskType', 'task_type'],
  ['payload', 'payload'],
  ['enabled', 'enabled'],
];

function buildUpdateColumns(
  input: CronJobUpdateInput,
  current: CronJob,
): Array<{ column: string; value: unknown }> {
  const columns: Array<{ column: string; value: unknown }> = [];
  for (const [key, column] of CRON_JOB_UPDATE_COLUMNS) {
    const value = input[key];
    if (value !== undefined) columns.push({ column, value });
  }
  if (input.schedule !== undefined || input.timezone !== undefined) {
    const schedule = input.schedule !== undefined ? input.schedule : current.schedule;
    const timezone = input.timezone !== undefined ? input.timezone : current.timezone;
    columns.push({ column: 'next_run_at', value: nextRunOrThrow(schedule, new Date(), timezone) });
  }
  return columns;
}

export function createCronOwnerBundle(pool: Queryable): CronOwnerBundle {
  const getById = async (id: string): Promise<CronJob | null> => {
    const { rows } = await pool.query<CronJobRow>(
      `SELECT ${CRON_JOB_COLUMNS} FROM ${cronJobsTable} WHERE id = $1`,
      [id],
    );
    const row = rows[0] as CronJobRow | undefined;
    return row ? rowToCronJob(row) : null;
  };

  return {
    async create(input) {
      const id = prefixedId('cron', 16);
      const now = new Date();
      const nextRunAt = nextRunOrThrow(input.schedule, now, input.timezone);
      const { rows } = await pool.query<CronJobRow>(
        `INSERT INTO ${cronJobsTable}
          (id, name, schedule, timezone, task_type, payload, enabled, next_run_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING ${CRON_JOB_COLUMNS}`,
        [
          id,
          input.name,
          input.schedule,
          input.timezone,
          input.taskType,
          input.payload,
          input.enabled,
          nextRunAt,
        ],
      );
      return rowToCronJob(rows[0] as CronJobRow);
    },

    async list() {
      const { rows } = await pool.query<CronJobRow>(
        `SELECT ${CRON_JOB_COLUMNS} FROM ${cronJobsTable} ORDER BY name ASC`,
      );
      return rows.map((row) => rowToCronJob(row as CronJobRow));
    },

    getById,

    async update(id, input) {
      const current = await getById(id);
      if (!current) return null;

      const updateColumns = buildUpdateColumns(input, current);
      const clauses = updateColumns.map(({ column }, index) => `${column} = $${index + 1}`);
      const values = updateColumns.map(({ value }) => value);
      const { rows } = await pool.query<CronJobRow>(
        `UPDATE ${cronJobsTable} SET ${clauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length + 1}
         RETURNING ${CRON_JOB_COLUMNS}`,
        [...values, id],
      );
      const row = rows[0] as CronJobRow | undefined;
      return row ? rowToCronJob(row) : null;
    },

    async pause(id) {
      const { rows } = await pool.query<CronJobRow>(
        `UPDATE ${cronJobsTable} SET enabled = false, updated_at = NOW() WHERE id = $1
         RETURNING ${CRON_JOB_COLUMNS}`,
        [id],
      );
      const row = rows[0] as CronJobRow | undefined;
      return row ? rowToCronJob(row) : null;
    },

    async resume(id) {
      const current = await getById(id);
      if (!current) return null;
      const nextRunAt = nextRunOrThrow(current.schedule, new Date(), current.timezone);
      const { rows } = await pool.query<CronJobRow>(
        `UPDATE ${cronJobsTable} SET enabled = true, next_run_at = $2, updated_at = NOW() WHERE id = $1
         RETURNING ${CRON_JOB_COLUMNS}`,
        [id, nextRunAt],
      );
      const row = rows[0] as CronJobRow | undefined;
      return row ? rowToCronJob(row) : null;
    },

    async delete(id) {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM ${cronJobsTable} WHERE id = $1`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async trigger(id, now) {
      const { rows } = await pool.query<CronJobRow>(
        `UPDATE ${cronJobsTable} SET last_run_at = $2, last_status = 'succeeded', last_error = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING ${CRON_JOB_COLUMNS}`,
        [id, now],
      );
      const row = rows[0] as CronJobRow | undefined;
      return row ? rowToCronJob(row) : null;
    },

    async statusSnapshots() {
      const { rows } = await pool.query<CronJobRow>(
        `SELECT ${CRON_JOB_STATUS_COLUMNS} FROM ${cronJobsTable} ORDER BY name ASC`,
      );
      return rows.map((row) => rowToStatusSnapshot(row as CronJobRow));
    },

    async claimDue(now, limit = 20) {
      const { rows } = await pool.query<CronJobRow>(
        `UPDATE ${cronJobsTable} SET updated_at = NOW()
         WHERE id IN (
           SELECT id FROM ${cronJobsTable}
           WHERE enabled = true AND next_run_at <= $1
           ORDER BY next_run_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         RETURNING ${CRON_JOB_COLUMNS}`,
        [now, limit],
      );
      return rows.map((row) => rowToCronJob(row as CronJobRow));
    },

    async applyRunSuccess(id, { nextRunAt, lastRunAt }) {
      await pool.query(
        `UPDATE ${cronJobsTable} SET next_run_at = $2, last_run_at = $3, last_status = 'succeeded',
                last_error = NULL, run_count = run_count + 1, updated_at = NOW()
         WHERE id = $1 AND enabled = true AND next_run_at <= $3`,
        [id, nextRunAt, lastRunAt],
      );
    },

    async applyRunFailure(id, { lastRunAt, error }) {
      await pool.query(
        `UPDATE ${cronJobsTable} SET last_run_at = $2, last_status = 'failed', last_error = $3,
                run_count = run_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [id, lastRunAt, error],
      );
    },
  };
}
