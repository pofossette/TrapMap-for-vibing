import { integer, text, timestamp } from 'drizzle-orm/pg-core';

export function auditTimestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function revisionColumns() {
  return {
    revisionNo: integer('revision_no').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function lifecycleEventColumns() {
  return {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    actorUserId: text('actor_user_id'),
    submissionId: text('submission_id'),
    revisionNo: integer('revision_no'),
    state: text('state').notNull(),
    note: text('note'),
  };
}

export function boundaryVersionsColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    packageName: text('package_name').notNull(),
    rangeValue: text('range_value').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function boundaryPrerequisitesColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    description: text('description').notNull(),
    kind: text('kind'),
    required: integer('required').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function boundarySignalsColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    pattern: text('pattern').notNull(),
    kind: text('kind').notNull().default('keyword'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function boundaryExclusionsColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    description: text('description').notNull(),
    kind: text('kind'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function boundaryEvidenceColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').notNull(),
    identifier: text('identifier').notNull(),
    url: text('url'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function artifactRevisionItemColumns() {
  return {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    path: text('path').notNull(),
  };
}

export function artifactFileDetailsColumns() {
  return {
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mediaType: text('media_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function artifactScriptDetailsColumns() {
  return {
    sha256: text('sha256').notNull(),
    capability: text('capability').notNull(),
    argsSchemaSummary: text('args_schema_summary').notNull(),
    sideEffectSummary: text('side_effect_summary').notNull(),
    defaultPolicy: text('default_policy').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

export function capsuleIndexColumns() {
  return {
    capsuleId: text('capsule_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    teamId: text('team_id'),
    scope: text('scope').notNull(),
    requiredLevel: integer('required_level').notNull(),
    status: text('status').notNull().default('synced'),
  };
}

export function maintenanceAssignmentColumns() {
  return {
    maintainerUserId: text('maintainer_user_id'),
    maintainerHandle: text('maintainer_handle'),
    maintainerLevel: integer('maintainer_level'),
    reviewBy: timestamp('review_by', { withTimezone: true }),
    ...auditTimestamps(),
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
