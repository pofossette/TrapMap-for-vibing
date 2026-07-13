/**
 * Task 9 migration script to backfill identity and audit data from the
 * legacy snapshot store to structured PostgreSQL tables.
 *
 * Run after deploying Phase 3 identity/audit structural tables:
 * 1. Ensure identity/audit tables exist (created via Drizzle migration 0011)
 * 2. Run this migration
 *
 * Phase: 3 (Round 10)
 */

import type { Pool } from 'pg';

import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

export interface IdentityAuditMigrationConfig {
  pool: Pool;
  store: SkillShareerStore;
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
 * Migrate identity and audit data from JSONB snapshot to structured tables.
 * Supports idempotent re-execution via ON CONFLICT DO NOTHING.
 */
export async function migrateIdentityAudit(
  config: IdentityAuditMigrationConfig,
): Promise<IdentityAuditMigrationResult> {
  const start = Date.now();
  const { pool, store, dryRun = false, onProgress } = config;
  const domains: IdentityAuditMigrationResult['domains'] = {};
  const snapshot = await store.snapshot();

  const domainDefs = [
    {
      name: 'users',
      table: 'users',
      columns: ['id', 'handle', 'notes', 'created_at', 'updated_at'],
      records: snapshot.users.map((u) => [u.id, u.handle, u.notes, u.createdAt, u.updatedAt]),
    },
    {
      name: 'teams',
      table: 'teams',
      columns: ['id', 'slug', 'name', 'description', 'created_at', 'updated_at'],
      records: snapshot.teams.map((t) => [
        t.id,
        t.slug,
        t.name,
        t.description,
        t.createdAt,
        t.updatedAt,
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
      records: snapshot.memberships.map((m) => [
        m.id,
        m.userId,
        m.teamId,
        m.roleTemplate,
        m.securityLevel,
        JSON.stringify(m.permissions),
        m.notes,
        m.createdAt,
        m.updatedAt,
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
      records: snapshot.sessions.map((s) => [
        s.id,
        s.tokenHash,
        s.userId,
        s.activeTeamId,
        s.subjectType,
        s.expiresAt,
        s.createdAt,
        s.updatedAt,
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
      records: snapshot.accessKeys.map((k) => [
        k.id,
        k.memberId,
        k.tokenHash,
        k.tokenPreview,
        k.issuedByUserId,
        k.teamId,
        k.level,
        k.notes,
        k.revokedAt,
        k.createdAt,
        k.updatedAt,
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
      records: snapshot.auditEvents.map((e) => [
        e.id,
        e.teamId,
        e.actorId,
        e.action,
        e.entityId,
        JSON.stringify(e.payload),
        e.createdAt,
        e.updatedAt,
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

    const placeholders = domain.columns.map((_, i) => `$${i + 1}`).join(', ');
    const columnList = domain.columns.map((c) => `"${c}"`).join(', ');
    const sql = `INSERT INTO "${domain.table}" (${columnList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

    const client = await pool.connect();
    try {
      let processed = 0;
      for (const record of domain.records) {
        try {
          const res = await client.query(sql, record);
          if (res.rowCount && res.rowCount > 0) {
            result.inserted++;
          } else {
            result.skipped++;
          }
        } catch (err) {
          result.errors.push(
            `Failed to insert ${domain.name} record: ${err instanceof Error ? err.message : String(err)}`,
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

  const verification = await verify({ pool, store, dryRun });

  return {
    domains,
    verification,
    durationMs: Date.now() - start,
  };
}

/**
 * Verify that the structured tables contain the same record counts as the snapshot.
 */
export async function verify(config: {
  pool: Pool;
  store: SkillShareerStore;
  dryRun?: boolean;
}): Promise<DomainVerification[]> {
  const { pool, store, dryRun = false } = config;
  const snapshot = await store.snapshot();

  const domainDefs = [
    { domain: 'users', table: 'users', snapshotCount: snapshot.users.length },
    { domain: 'teams', table: 'teams', snapshotCount: snapshot.teams.length },
    { domain: 'memberships', table: 'memberships', snapshotCount: snapshot.memberships.length },
    { domain: 'sessions', table: 'sessions', snapshotCount: snapshot.sessions.length },
    { domain: 'accessKeys', table: 'access_keys', snapshotCount: snapshot.accessKeys.length },
    { domain: 'auditEvents', table: 'audit_events', snapshotCount: snapshot.auditEvents.length },
  ];

  if (dryRun) {
    return domainDefs.map((d) => ({
      domain: d.domain,
      snapshotCount: d.snapshotCount,
      tableCount: -1,
      matched: false,
    }));
  }

  const client = await pool.connect();
  try {
    const results: DomainVerification[] = [];
    for (const def of domainDefs) {
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM "${def.table}"`,
      );
      const tableCount = Number(rows[0]?.count ?? 0);
      results.push({
        domain: def.domain,
        snapshotCount: def.snapshotCount,
        tableCount,
        matched: tableCount === def.snapshotCount,
      });
    }
    return results;
  } finally {
    client.release();
  }
}
