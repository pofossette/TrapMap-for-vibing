import type { Pool } from 'pg';

import type { IdentityAccessSnapshotData, IdentityAccessSnapshotPort } from './pg-ports.js';

/**
 * Task 9-only source data for the legacy identity/audit snapshot backfill.
 * This adapter is deliberately not a runtime identity path.
 */
export interface IdentityAuditSnapshot extends IdentityAccessSnapshotData {
  users: Array<{
    id: string;
    handle: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  teams: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  memberships: Array<{
    id: string;
    userId: string;
    teamId: string;
    roleTemplate: string;
    securityLevel: number;
    permissions: string[];
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  sessions: Array<{
    id: string;
    tokenHash: string;
    userId: string | null;
    activeTeamId: string | null;
    subjectType: string;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  accessKeys: Array<{
    id: string;
    memberId: string;
    tokenHash: string;
    tokenPreview: string;
    issuedByUserId: string;
    teamId: string;
    level: number;
    notes: string | null;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    teamId: string | null;
    actorId: string;
    action: string;
    entityId: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface IdentityAuditMigrationConfig {
  pool: Pool;
  snapshot: IdentityAccessSnapshotPort<IdentityAuditSnapshot>;
  dryRun?: boolean;
  onProgress?: (info: { domain: string; processed: number; total: number }) => void;
}

export interface DomainVerification {
  domain: string;
  snapshotCount: number;
  tableCount: number;
  matched: boolean;
}

export interface IdentityAuditMigrationResult {
  domains: Record<string, { inserted: number; skipped: number; errors: string[] }>;
  verification: DomainVerification[];
  durationMs: number;
}

/**
 * Task 9-only backfill from the legacy snapshot into identity-owned tables.
 * It is idempotent and must not be used to serve runtime identity traffic.
 */
export async function migrateIdentityAudit(
  config: IdentityAuditMigrationConfig,
): Promise<IdentityAuditMigrationResult> {
  const start = Date.now();
  const { pool, snapshot: snapshotPort, dryRun = false, onProgress } = config;
  const domains: IdentityAuditMigrationResult['domains'] = {};
  const snapshot = await snapshotPort.read();

  const domainDefs = [
    {
      name: 'users',
      table: 'users',
      columns: ['id', 'handle', 'notes', 'created_at', 'updated_at'],
      records: snapshot.users.map((user) => [
        user.id,
        user.handle,
        user.notes,
        user.createdAt,
        user.updatedAt,
      ]),
    },
    {
      name: 'teams',
      table: 'teams',
      columns: ['id', 'slug', 'name', 'description', 'created_at', 'updated_at'],
      records: snapshot.teams.map((team) => [
        team.id,
        team.slug,
        team.name,
        team.description,
        team.createdAt,
        team.updatedAt,
      ]),
    },
    {
      name: 'memberships',
      table: 'memberships',
      columns: [
        'id',
        'user_id',
        'team_id',
        'role_template',
        'security_level',
        'permissions',
        'notes',
        'created_at',
        'updated_at',
      ],
      records: snapshot.memberships.map((membership) => [
        membership.id,
        membership.userId,
        membership.teamId,
        membership.roleTemplate,
        membership.securityLevel,
        JSON.stringify(membership.permissions),
        membership.notes,
        membership.createdAt,
        membership.updatedAt,
      ]),
    },
    {
      name: 'sessions',
      table: 'sessions',
      columns: [
        'id',
        'token_hash',
        'user_id',
        'active_team_id',
        'subject_type',
        'expires_at',
        'created_at',
        'updated_at',
      ],
      records: snapshot.sessions.map((session) => [
        session.id,
        session.tokenHash,
        session.userId,
        session.activeTeamId,
        session.subjectType,
        session.expiresAt,
        session.createdAt,
        session.updatedAt,
      ]),
    },
    {
      name: 'accessKeys',
      table: 'access_keys',
      columns: [
        'id',
        'member_id',
        'token_hash',
        'token_preview',
        'issued_by_user_id',
        'team_id',
        'level',
        'notes',
        'revoked_at',
        'created_at',
        'updated_at',
      ],
      records: snapshot.accessKeys.map((key) => [
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
      ]),
    },
    {
      name: 'auditEvents',
      table: 'audit_events',
      columns: [
        'id',
        'team_id',
        'actor_id',
        'action',
        'entity_id',
        'payload',
        'created_at',
        'updated_at',
      ],
      records: snapshot.auditEvents.map((event) => [
        event.id,
        event.teamId,
        event.actorId,
        event.action,
        event.entityId,
        JSON.stringify(event.payload),
        event.createdAt,
        event.updatedAt,
      ]),
    },
  ];

  for (const domain of domainDefs) {
    const result = { inserted: 0, skipped: 0, errors: [] as string[] };
    if (domain.records.length === 0) {
      domains[domain.name] = result;
      onProgress?.({ domain: domain.name, processed: 0, total: 0 });
      continue;
    }
    if (dryRun) {
      result.inserted = domain.records.length;
      domains[domain.name] = result;
      onProgress?.({
        domain: domain.name,
        processed: domain.records.length,
        total: domain.records.length,
      });
      continue;
    }

    const placeholders = domain.columns.map((_, index) => `$${index + 1}`).join(', ');
    const columnList = domain.columns.map((column) => `"${column}"`).join(', ');
    const sql = `INSERT INTO "${domain.table}" (${columnList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
    const client = await pool.connect();
    try {
      let processed = 0;
      for (const record of domain.records) {
        try {
          const response = await client.query(sql, record);
          if (response.rowCount && response.rowCount > 0) result.inserted++;
          else result.skipped++;
        } catch (error) {
          result.errors.push(
            `Failed to insert ${domain.name} record: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        processed++;
      }
      onProgress?.({ domain: domain.name, processed, total: domain.records.length });
    } finally {
      client.release();
    }
    domains[domain.name] = result;
  }

  return {
    domains,
    verification: await verify({ pool, snapshot: snapshotPort, dryRun }),
    durationMs: Date.now() - start,
  };
}

export async function verify(config: {
  pool: Pool;
  snapshot: IdentityAccessSnapshotPort<IdentityAuditSnapshot>;
  dryRun?: boolean;
}): Promise<DomainVerification[]> {
  const { pool, snapshot: snapshotPort, dryRun = false } = config;
  const snapshot = await snapshotPort.read();
  const domainDefs = [
    { domain: 'users', table: 'users', snapshotCount: snapshot.users.length },
    { domain: 'teams', table: 'teams', snapshotCount: snapshot.teams.length },
    { domain: 'memberships', table: 'memberships', snapshotCount: snapshot.memberships.length },
    { domain: 'sessions', table: 'sessions', snapshotCount: snapshot.sessions.length },
    { domain: 'accessKeys', table: 'access_keys', snapshotCount: snapshot.accessKeys.length },
    { domain: 'auditEvents', table: 'audit_events', snapshotCount: snapshot.auditEvents.length },
  ];
  if (dryRun)
    return domainDefs.map((definition) => ({ ...definition, tableCount: -1, matched: false }));

  const client = await pool.connect();
  try {
    return await Promise.all(
      domainDefs.map(async (definition) => {
        const { rows } = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM "${definition.table}"`,
        );
        const tableCount = Number(rows[0]?.count ?? 0);
        return { ...definition, tableCount, matched: tableCount === definition.snapshotCount };
      }),
    );
  } finally {
    client.release();
  }
}
