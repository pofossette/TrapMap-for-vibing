import { randomUUID } from 'node:crypto';

import type {
  AccessKeyRepositoryPort,
  AuditLogPort,
  MembershipRepositoryPort,
  PermissionCheckPort,
  SessionLookupPort,
  SessionRepositoryPort,
  TeamLookupPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import type { Permission } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { IdentityAccessPortDeps } from './deps.js';

type Queryable = Pick<Pool, 'query'>;

function nowIso(): string {
  return new Date().toISOString();
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

function rolePermissions(role: string): Permission[] {
  if (role === 'admin' || role === 'system-admin')
    return ['admin', 'write', 'read'] as Permission[];
  if (role === 'editor') return ['write', 'read'] as Permission[];
  return ['read'] as Permission[];
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
      } as never;
    },
    async getByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM sessions WHERE token_hash = $1', [
        tokenHash,
      ]);
      return rows[0] ? (rowToSession(rows[0] as Record<string, unknown>) as never) : null;
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
      return rowToSession(rows[0] as Record<string, unknown>) as never;
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
      return (rows[0] as never) ?? null;
    },
    async getById(keyId) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE id = $1', [keyId]);
      return (rows[0] as never) ?? null;
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
      return rows as never[];
    },
  };
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
        [team.id, team.slug, team.name ?? team.slug, team.description ?? null],
      );
    },
    async getById(teamId) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
      return (rows[0] as never) ?? null;
    },
    async getBySlug(slug) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE slug = $1', [slug]);
      return (rows[0] as never) ?? null;
    },
    async listAll() {
      const { rows } = await pool.query('SELECT * FROM teams');
      return rows as never[];
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
          member.roleTemplate ?? (member as { role?: string }).role ?? 'user',
          member.securityLevel ?? 0,
          JSON.stringify(member.permissions ?? []),
          member.notes ?? null,
        ],
      );
    },
    async getById(memberId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE id = $1', [memberId]);
      return (rows[0] as never) ?? null;
    },
    async findByUserAndTeam(userId, teamId) {
      const { rows } = await pool.query(
        'SELECT * FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamId],
      );
      return (rows[0] as never) ?? null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE user_id = $1', [userId]);
      return rows as never[];
    },
    async listByTeam(teamId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE team_id = $1', [teamId]);
      return rows as never[];
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
      return (rows[0] as never) ?? null;
    },
    async getByHandle(handle) {
      const { rows } = await pool.query('SELECT * FROM users WHERE handle = $1', [handle]);
      return (rows[0] as never) ?? null;
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
          securityLevel: 10,
        };
      return row.user_id && row.handle
        ? {
            sessionId: String(row.session_id),
            userId: String(row.user_id),
            handle: String(row.handle),
            activeTeamId: typeof row.active_team_id === 'string' ? row.active_team_id : null,
            securityLevel: 1,
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
      return rows[0] ? rolePermissions(String(rows[0].role_template)) : [];
    },
    async hasPermission(userId, teamId, permission) {
      return (await this.resolvePermissions(userId, teamId)).includes(permission);
    },
  };
  const auditLog: AuditLogPort = {
    async record(entry) {
      await pool.query(
        'INSERT INTO audit_events (id, action, actor_id, entity_id, team_id, payload, event_version, source_service, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          randomUUID(),
          entry.action,
          entry.actorId,
          entry.entityId ?? null,
          entry.teamId ?? null,
          JSON.stringify(entry.metadata ?? {}),
          entry.eventVersion ?? 1,
          entry.sourceService ?? 'identity-access',
          entry.timestamp ?? nowIso(),
        ],
      );
    },
    async query() {
      return { items: [], total: 0 };
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
    ...(options.systemAdminKey !== undefined ? { systemAdminKey: options.systemAdminKey } : {}),
  };
}
