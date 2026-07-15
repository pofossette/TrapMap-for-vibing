/**
 * Shared auth / identity domain tables and sequences.
 *
 * Covers: users, teams, memberships, sessions, access keys, audit events.
 */
import {
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { auditTimestamps } from './column-factories.js';

// =============================================================================
// Sequences
// =============================================================================

export const userIdSeq = pgSequence('user_id_seq', {
  startWith: 1,
  increment: 1,
});

export const teamIdSeq = pgSequence('team_id_seq', {
  startWith: 1,
  increment: 1,
});

export const membershipIdSeq = pgSequence('membership_id_seq', {
  startWith: 1,
  increment: 1,
});

export const sessionIdSeq = pgSequence('session_id_seq', {
  startWith: 1,
  increment: 1,
});

export const accessKeyIdSeq = pgSequence('access_key_id_seq', {
  startWith: 1,
  increment: 1,
});

export const auditEventIdSeq = pgSequence('audit_event_id_seq', {
  startWith: 1,
  increment: 1,
});

// =============================================================================
// Tables
// =============================================================================

export const usersTable = pgTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  notes: text('notes'),
  ...auditTimestamps(),
});

export const teamsTable = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...auditTimestamps(),
  },
  (table) => [uniqueIndex('teams_slug_uidx').on(table.slug)],
);

export const membershipsTable = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    roleTemplate: text('role_template').notNull(),
    securityLevel: integer('security_level').notNull(),
    permissions: jsonb('permissions').notNull().$type<string[]>().default([]),
    notes: text('notes'),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('memberships_user_team_uidx').on(table.userId, table.teamId),
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_team_id_idx').on(table.teamId),
  ],
);

export const sessionsTable = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id').references(() => usersTable.id),
    activeTeamId: text('active_team_id').references(() => teamsTable.id),
    subjectType: text('subject_type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...auditTimestamps(),
  },
  (table) => [
    index('sessions_token_hash_idx').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const accessKeysTable = pgTable(
  'access_keys',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => membershipsTable.id),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPreview: text('token_preview').notNull(),
    issuedByUserId: text('issued_by_user_id')
      .notNull()
      .references(() => usersTable.id),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id),
    level: integer('level').notNull(),
    notes: text('notes'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditTimestamps(),
  },
  (table) => [
    index('access_keys_token_hash_idx').on(table.tokenHash),
    index('access_keys_member_id_idx').on(table.memberId),
    index('access_keys_team_id_idx').on(table.teamId),
    index('access_keys_issued_by_user_id_idx').on(table.issuedByUserId),
  ],
);

export const auditEventsTable = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id'),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    eventVersion: integer('event_version').notNull().default(1),
    sourceService: text('source_service').notNull().default('server-compatibility-seam'),
    requestId: text('request_id'),
    traceId: text('trace_id'),
    operationId: text('operation_id'),
    causationId: text('causation_id'),
    outcome: text('outcome').notNull().default('success'),
    ...auditTimestamps(),
  },
  (table) => [
    index('audit_events_team_id_idx').on(table.teamId),
    index('audit_events_actor_id_idx').on(table.actorId),
    index('audit_events_action_idx').on(table.action),
    index('audit_events_entity_id_idx').on(table.entityId),
    index('audit_events_request_id_idx').on(table.requestId),
    index('audit_events_trace_id_idx').on(table.traceId),
    index('audit_events_operation_id_idx').on(table.operationId),
    index('audit_events_causation_id_idx').on(table.causationId),
    index('audit_events_created_at_idx').on(table.createdAt),
  ],
);
