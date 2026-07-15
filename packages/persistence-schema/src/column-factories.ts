import { integer, text, timestamp } from 'drizzle-orm/pg-core';

export function auditTimestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function revisionColumns() {
  return {
    id: text('id').primaryKey(),
    revisionNo: integer('revision_no').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function taskQueueColumns() {
  return {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key'),
    processAfter: timestamp('process_after', { withTimezone: true }).notNull().defaultNow(),
    workerId: text('worker_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    ...auditTimestamps(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  };
}
