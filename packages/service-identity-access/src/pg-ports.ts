import { randomUUID } from 'node:crypto';

import type {
  AccessKeyRecord,
  AccessKeyRepositoryPort,
  AuditLogPort,
  MembershipRecord,
  MembershipRepositoryPort,
  PermissionCheckPort,
  SessionLookupPort,
  SessionRepositoryPort,
  TeamLookupPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import {
  defaultRoleTemplate,
  defaultSecurityLevel,
  defaultTeamName,
  permissionsForRole,
  sessionSecurityLevel,
} from '@trapmap/backend-core';
import { nowIso, uniqBy } from '@trapmap/lib';
import type { Pool } from 'pg';

import type { IdentityActorLookupSource } from './actor-lookup.js';
import type { IdentityAccessPortDeps } from './deps.js';

type Queryable = Pick<Pool, 'query'>;

async function listMemberships(pool: Queryable, column: 'user_id' | 'team_id', value: string) {
  const { rows } = await pool.query(`SELECT * FROM memberships WHERE ${column} = $1`, [value]);
  return rows.map((row) => rowToMembership(row as Record<string, unknown>));
}

// lib type gap: repo-ports MembershipRecord narrows roleTemplate to a fixed
// union while rows carry arbitrary role templates
function rowToMembership(row: Record<string, unknown>): MembershipRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    teamId: String(row.team_id),
    roleTemplate: String(row.role_template) as MembershipRecord['roleTemplate'],
    securityLevel: Number(row.security_level),
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    notes: typeof row.notes === 'string' ? row.notes : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : nowIso(),
  };
}

// lib type gap: repo-ports AccessKeyRecord models revokedAt/updatedAt as
// optional, while rows always carry them (null when never revoked)
function rowToAccessKey(row: Record<string, unknown>): AccessKeyRecord {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    tokenHash: String(row.token_hash),
    tokenPreview: String(row.token_preview),
    issuedByUserId: String(row.issued_by_user_id),
    teamId: String(row.team_id),
    level: Number(row.level),
    notes: typeof row.notes === 'string' ? row.notes : null,
    revokedAt: row.revoked_at instanceof Date ? row.revoked_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : nowIso(),
  } as unknown as AccessKeyRecord; // lib type gap:
}

function rowToUser(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    handle: String(row.handle),
    notes: typeof row.notes === 'string' ? row.notes : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : nowIso(),
  };
}

function rowToTeam(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : nowIso(),
  };
}

/**
 * Temporary compatibility input for the identity backfill only.
 *
 * Task 9 removes this port with the legacy snapshot table.  Its structural
 * shape deliberately prevents a server store implementation from becoming a
 * service API dependency.
 */
export interface IdentityAccessSnapshotPort<
  TSnapshot extends IdentityAccessSnapshotData = IdentityAccessSnapshotData,
> {
  read(): Promise<TSnapshot>;
  transact<TResult>(work: (snapshot: TSnapshot) => TResult | Promise<TResult>): Promise<TResult>;
  nextId(snapshot: TSnapshot, kind: IdentitySnapshotIdKind): string;
}

export type IdentitySnapshotIdKind =
  | 'user'
  | 'team'
  | 'member'
  | 'session'
  | 'access_key'
  | 'audit';

export interface IdentityAccessSnapshotData {
  users: unknown[];
  teams: unknown[];
  memberships: unknown[];
  sessions: unknown[];
  accessKeys: unknown[];
  auditEvents: unknown[];
}

export function createIdentityAccessSnapshotPort<TSnapshot extends IdentityAccessSnapshotData>(
  port: IdentityAccessSnapshotPort<TSnapshot>,
): IdentityAccessSnapshotPort<TSnapshot> {
  return port;
}

/**
 * Deliberately structural composition boundary for identity capabilities.
 * Hosts may inject this bundle into a consumer, but consumers must not
 * construct identity repositories or reach into an owner implementation.
 */
export function createIdentityAccessOwnerBundle(
  deps: IdentityAccessPortDeps,
): IdentityAccessPortDeps {
  return deps;
}

export function createIdentityAccessActorLookupSource(pool: Queryable): IdentityActorLookupSource {
  return {
    async getUsersByIds(userIds) {
      if (userIds.length === 0) return [];
      const { rows } = await pool.query('SELECT id, handle FROM users WHERE id = ANY($1::text[])', [
        userIds,
      ]);
      return rows.map((row) => ({ id: String(row.id), handle: String(row.handle) }));
    },
    async getMembershipLevels(pairs) {
      const levels = new Map<string, number>();
      const uniquePairs = uniqBy(pairs, (pair) => `${pair.userId}:${pair.teamId}`);
      if (uniquePairs.length === 0) return levels;
      const { rows } = await pool.query(
        `SELECT user_id, team_id, security_level
         FROM memberships
         WHERE (user_id, team_id) IN (
           SELECT * FROM UNNEST($1::text[], $2::text[])
         )`,
        [uniquePairs.map((pair) => pair.userId), uniquePairs.map((pair) => pair.teamId)],
      );
      for (const row of rows) {
        levels.set(`${String(row.user_id)}:${String(row.team_id)}`, Number(row.security_level));
      }
      return levels;
    },
  };
}

function rowToSession(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    subjectType: row.subject_type === 'system-admin' ? 'system-admin' : 'user',
    userId: typeof row.user_id === 'string' ? row.user_id : null,
    activeTeamId: typeof row.active_team_id === 'string' ? row.active_team_id : null,
    tokenHash: String(row.token_hash),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : nowIso(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : nowIso(),
  };
}

export function createIdentityAccessPgDeps(
  pool: Queryable,
  options: { systemAdminKey?: string | null } = {},
): IdentityAccessPortDeps {
  const sessionRepo: SessionRepositoryPort = {
    async nextId() {
      const { rows } = await pool.query<{ nextval: string }>(
        "SELECT nextval('session_id_seq') AS nextval",
      );
      return `session_${rows[0]?.nextval ?? '1'}`;
    },
    async create(session) {
      const id = await this.nextId();
      const createdAt = nowIso();
      await pool.query(
        `INSERT INTO sessions (id, token_hash, user_id, active_team_id, subject_type, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          id,
          session.tokenHash,
          session.userId,
          session.activeTeamId,
          session.subjectType ?? 'user',
          session.expiresAt,
          createdAt,
        ],
      );
      return {
        id,
        subjectType: session.subjectType ?? 'user',
        userId: session.userId,
        activeTeamId: session.activeTeamId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt ?? null,
        createdAt,
        updatedAt: createdAt,
      };
    },
    async getByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM sessions WHERE token_hash = $1', [
        tokenHash,
      ]);
      return rows[0] ? rowToSession(rows[0] as Record<string, unknown>) : null;
    },
    async deleteByTokenHash(tokenHash) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async updateActiveTeam(sessionId, teamId) {
      const { rows } = await pool.query(
        'UPDATE sessions SET active_team_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [teamId, sessionId],
      );
      if (!rows[0]) throw new Error(`Session ${sessionId} not found`);
      return rowToSession(rows[0] as Record<string, unknown>);
    },
  };
  const accessKeyRepo: AccessKeyRepositoryPort = {
    async nextId() {
      const { rows } = await pool.query<{ nextval: string }>(
        "SELECT nextval('access_key_id_seq') AS nextval",
      );
      return `access_key_${rows[0]?.nextval ?? '1'}`;
    },
    async insert(key) {
      await pool.query(
        'INSERT INTO access_keys (id, member_id, token_hash, token_preview, issued_by_user_id, team_id, level, notes, revoked_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          key.id,
          key.memberId,
          key.tokenHash,
          key.tokenPreview,
          key.issuedByUserId,
          key.teamId,
          key.level,
          key.notes,
          key.revokedAt,
          key.createdAt,
          key.updatedAt,
        ],
      );
    },
    async getByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE token_hash = $1', [
        tokenHash,
      ]);
      return rows[0] ? rowToAccessKey(rows[0] as Record<string, unknown>) : null;
    },
    async getById(keyId) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE id = $1', [keyId]);
      return rows[0] ? rowToAccessKey(rows[0] as Record<string, unknown>) : null;
    },
    async revoke(keyId) {
      await pool.query(
        'UPDATE access_keys SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1',
        [keyId],
      );
    },
    async listByMember(memberId) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE member_id = $1', [
        memberId,
      ]);
      return rows.map((row) => rowToAccessKey(row as Record<string, unknown>));
    },
  };
  const actorLookup = createIdentityAccessActorLookupSource(pool);
  const teamRepo: TeamRepositoryPort = {
    async nextId() {
      const { rows } = await pool.query<{ nextval: string }>(
        "SELECT nextval('team_id_seq') AS nextval",
      );
      return `team_${rows[0]?.nextval ?? '1'}`;
    },
    async insert(team) {
      await pool.query(
        'INSERT INTO teams (id, slug, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())',
        [team.id, team.slug, defaultTeamName(team.name, team.slug), team.description ?? null],
      );
    },
    async getById(teamId) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
      return rows[0] ? rowToTeam(rows[0] as Record<string, unknown>) : null;
    },
    async getBySlug(slug) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE slug = $1', [slug]);
      return rows[0] ? rowToTeam(rows[0] as Record<string, unknown>) : null;
    },
    async listAll() {
      const { rows } = await pool.query('SELECT * FROM teams');
      return rows.map((row) => rowToTeam(row as Record<string, unknown>));
    },
    async update(teamId, updates) {
      await pool.query(
        'UPDATE teams SET name = COALESCE($1, name), slug = COALESCE($2, slug), description = COALESCE($3, description), updated_at = NOW() WHERE id = $4',
        [updates.name ?? null, updates.slug ?? null, updates.description ?? null, teamId],
      );
    },
  };
  const membershipRepo: MembershipRepositoryPort = {
    async nextId() {
      const { rows } = await pool.query<{ nextval: string }>(
        "SELECT nextval('membership_id_seq') AS nextval",
      );
      return `member_${rows[0]?.nextval ?? '1'}`;
    },
    async insert(member) {
      await pool.query(
        'INSERT INTO memberships (id, user_id, team_id, role_template, security_level, permissions, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',
        [
          member.id,
          member.userId,
          member.teamId,
          member.roleTemplate ?? defaultRoleTemplate((member as { role?: string }).role),
          defaultSecurityLevel(member.securityLevel),
          JSON.stringify(member.permissions ?? []),
          member.notes ?? null,
        ],
      );
    },
    async getById(memberId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE id = $1', [memberId]);
      return rows[0] ? rowToMembership(rows[0] as Record<string, unknown>) : null;
    },
    async findByUserAndTeam(userId, teamId) {
      const { rows } = await pool.query(
        'SELECT * FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamId],
      );
      return rows[0] ? rowToMembership(rows[0] as Record<string, unknown>) : null;
    },
    async listByUser(userId) {
      return listMemberships(pool, 'user_id', userId);
    },
    async listByTeam(teamId) {
      return listMemberships(pool, 'team_id', teamId);
    },
    async update(memberId, updates) {
      await pool.query(
        'UPDATE memberships SET role_template = COALESCE($1, role_template), security_level = COALESCE($2, security_level), permissions = COALESCE($3::jsonb, permissions), notes = COALESCE($4, notes), updated_at = NOW() WHERE id = $5',
        [
          (updates as { roleTemplate?: string }).roleTemplate ?? null,
          updates.securityLevel ?? null,
          updates.permissions ? JSON.stringify(updates.permissions) : null,
          updates.notes ?? null,
          memberId,
        ],
      );
    },
  };
  const userRepo: UserRepositoryPort = {
    async nextId() {
      const { rows } = await pool.query<{ nextval: string }>(
        "SELECT nextval('user_id_seq') AS nextval",
      );
      return `user_${rows[0]?.nextval ?? '1'}`;
    },
    async insert(user) {
      await pool.query(
        'INSERT INTO users (id, handle, notes, created_at, updated_at) VALUES ($1,$2,$3,NOW(),NOW())',
        [user.id, user.handle, user.notes ?? null],
      );
    },
    async getById(userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
    },
    async getByHandle(handle) {
      const { rows } = await pool.query('SELECT * FROM users WHERE handle = $1', [handle]);
      return rows[0] ? rowToUser(rows[0] as Record<string, unknown>) : null;
    },
    async update(userId, updates) {
      await pool.query(
        'UPDATE users SET handle = COALESCE($1, handle), notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3',
        [updates.handle ?? null, updates.notes ?? null, userId],
      );
    },
  };
  const sessionLookup: SessionLookupPort = {
    async resolveSession(token) {
      const { rows } = await pool.query(
        'SELECT s.id AS session_id, s.subject_type, u.id AS user_id, u.handle, s.active_team_id FROM sessions s LEFT JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1',
        [token],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      if (row.subject_type === 'system-admin')
        return {
          sessionId: String(row.session_id),
          userId: 'system-admin',
          handle: 'system-admin',
          activeTeamId: null,
          securityLevel: sessionSecurityLevel('system-admin'),
        };
      return row.user_id && row.handle
        ? {
            sessionId: String(row.session_id),
            userId: String(row.user_id),
            handle: String(row.handle),
            activeTeamId: typeof row.active_team_id === 'string' ? row.active_team_id : null,
            securityLevel: sessionSecurityLevel('user'),
          }
        : null;
    },
  };
  const teamLookup: TeamLookupPort = {
    async getTeam(teamId) {
      const { rows } = await pool.query('SELECT id, slug, name FROM teams WHERE id = $1', [teamId]);
      return rows[0]
        ? { teamId: String(rows[0].id), slug: String(rows[0].slug), name: String(rows[0].name) }
        : null;
    },
    async listTeamsForUser(userId) {
      const { rows } = await pool.query(
        'SELECT t.id, t.slug, t.name FROM teams t JOIN memberships m ON t.id = m.team_id WHERE m.user_id = $1',
        [userId],
      );
      return rows.map((row) => ({
        teamId: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
      }));
    },
  };
  const permissionCheck: PermissionCheckPort = {
    async resolvePermissions(userId, teamId) {
      if (!teamId) return [];
      const { rows } = await pool.query(
        'SELECT role_template FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamId],
      );
      return rows[0] ? permissionsForRole(String(rows[0].role_template)) : [];
    },
    async hasPermission(userId, teamId, permission) {
      return (await this.resolvePermissions(userId, teamId)).includes(permission);
    },
  };
  const auditLog: AuditLogPort = {
    async record(entry) {
      await pool.query(
        'INSERT INTO audit_events (id, action, actor_id, entity_id, team_id, payload, event_version, source_service, request_id, trace_id, operation_id, causation_id, outcome, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)',
        [
          randomUUID(),
          entry.action,
          entry.actorId,
          entry.entityId ?? null,
          entry.teamId ?? null,
          JSON.stringify(entry.metadata ?? {}),
          entry.eventVersion ?? 1,
          entry.sourceService ?? 'identity-access',
          entry.requestId ?? null,
          entry.traceId ?? null,
          entry.operationId ?? null,
          entry.causationId ?? null,
          entry.outcome ?? 'success',
          entry.timestamp ?? nowIso(),
        ],
      );
    },
    async query(filter) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      const add = (column: string, value: string | undefined) => {
        if (value === undefined) return;
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      };
      add('actor_id', filter.actorId);
      add('entity_id', filter.entityId);
      add('team_id', filter.teamId);
      add('request_id', filter.requestId);
      add('trace_id', filter.traceId);
      add('operation_id', filter.operationId);
      add('causation_id', filter.causationId);
      if (filter.from) {
        values.push(filter.from);
        conditions.push(`created_at >= $${values.length}`);
      }
      if (filter.to) {
        values.push(filter.to);
        conditions.push(`created_at <= $${values.length}`);
      }
      if (filter.action?.length) {
        values.push(filter.action);
        conditions.push(`action = ANY($${values.length}::text[])`);
      }
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const [{ rows: countRows }, { rows }] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total FROM audit_events${where}`, values),
        pool.query(
          `SELECT id, action, actor_id, entity_id, team_id, payload, event_version, source_service, request_id, trace_id, operation_id, causation_id, outcome, created_at, updated_at FROM audit_events${where} ORDER BY created_at DESC LIMIT ${Math.max(1, filter.limit ?? 25)}`,
          values,
        ),
      ]);
      return {
        items: rows.map((row) => ({
          id: String(row.id),
          action: String(row.action),
          actorId: String(row.actor_id),
          entityId: typeof row.entity_id === 'string' ? row.entity_id : undefined,
          teamId: typeof row.team_id === 'string' ? row.team_id : undefined,
          metadata: (row.payload as Record<string, unknown>) ?? {},
          eventVersion: Number(row.event_version ?? 1),
          sourceService: String(row.source_service ?? 'identity-access'),
          requestId: typeof row.request_id === 'string' ? row.request_id : undefined,
          traceId: typeof row.trace_id === 'string' ? row.trace_id : undefined,
          operationId: typeof row.operation_id === 'string' ? row.operation_id : undefined,
          causationId: typeof row.causation_id === 'string' ? row.causation_id : undefined,
          outcome: row.outcome === 'rejected' || row.outcome === 'failed' ? row.outcome : 'success',
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : undefined,
          timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : undefined,
        })),
        total: Number(countRows[0]?.total ?? 0),
      };
    },
  };
  return {
    sessionRepo,
    accessKeyRepo,
    teamRepo,
    membershipRepo,
    userRepo,
    sessionLookup,
    teamLookup,
    permissionCheck,
    auditLog,
    actorLookup,
    ...(options.systemAdminKey !== undefined ? { systemAdminKey: options.systemAdminKey } : {}),
  };
}
