/**
 * Shared cron scheduler domain table.
 *
 * Covers: durable cron job registry with a partial next-run index over
 * enabled jobs so the scheduler tick can fetch due rows efficiently.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { auditTimestamps } from './column-factories.js';

export const cronJobs = pgTable(
  'cron_jobs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    schedule: text('schedule').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    taskType: text('task_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    runCount: integer('run_count').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    index('cron_jobs_next_run_enabled_idx').on(table.nextRunAt).where(sql`${table.enabled}`),
  ],
);
