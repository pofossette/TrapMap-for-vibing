import { describe, expect, it, vi } from 'vitest';

import {
  type IdentityAuditSnapshot,
  migrateIdentityAudit,
  verify,
} from './identity-audit-backfill.js';
import type { IdentityAccessSnapshotPort } from './pg-ports.js';

const timestamp = '2026-07-13T00:00:00.000Z';

function createSnapshot(): IdentityAccessSnapshotPort<IdentityAuditSnapshot> {
  const snapshot: IdentityAuditSnapshot = {
    users: [
      { id: 'user_1', handle: 'alice', notes: null, createdAt: timestamp, updatedAt: timestamp },
    ],
    teams: [
      {
        id: 'team_1',
        slug: 'alpha',
        name: 'Alpha',
        description: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    memberships: [
      {
        id: 'member_1',
        userId: 'user_1',
        teamId: 'team_1',
        roleTemplate: 'admin',
        securityLevel: 10,
        permissions: ['audit:read'],
        notes: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sessions: [
      {
        id: 'session_1',
        tokenHash: 'hash',
        userId: 'user_1',
        activeTeamId: 'team_1',
        subjectType: 'user',
        expiresAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    accessKeys: [
      {
        id: 'key_1',
        memberId: 'member_1',
        tokenHash: 'key-hash',
        tokenPreview: 'key',
        issuedByUserId: 'user_1',
        teamId: 'team_1',
        level: 10,
        notes: null,
        revokedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    auditEvents: [
      {
        id: 'audit_1',
        teamId: 'team_1',
        actorId: 'user_1',
        action: 'knowledge-reviewed',
        entityId: 'entry_1',
        payload: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
  return {
    read: async () => snapshot,
    transact: async (work) => work(snapshot),
    nextId: () => 'unused',
  };
}

function createPool() {
  const rows = new Map<string, unknown[][]>();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const table = sql.match(/(?:INTO|FROM)\s+"(\w+)"/i)?.[1] ?? 'unknown';
    if (sql.toLowerCase().includes('count(*)'))
      return { rows: [{ count: String(rows.get(table)?.length ?? 0) }], rowCount: 0 };
    if (sql.toLowerCase().includes('insert')) {
      rows.set(table, [...(rows.get(table) ?? []), params ?? []]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { connect: vi.fn(async () => ({ query, release: vi.fn() })) };
}

describe('Task 9 identity/audit backfill', () => {
  it('accepts only the identity snapshot port and supports dry runs', async () => {
    const snapshot = createSnapshot();
    const pool = createPool();
    const result = await migrateIdentityAudit({ pool: pool as never, snapshot, dryRun: true });

    expect(result.domains.users.inserted).toBe(1);
    expect(result.domains.auditEvents.inserted).toBe(1);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('writes every identity domain and verifies counts', async () => {
    const snapshot = createSnapshot();
    const pool = createPool();
    const result = await migrateIdentityAudit({ pool: pool as never, snapshot });

    expect(Object.values(result.domains).every((domain) => domain.inserted === 1)).toBe(true);
    expect(result.verification.every((domain) => domain.matched)).toBe(true);
  });

  it('reports unmatched empty tables without writing', async () => {
    const result = await verify({ pool: createPool() as never, snapshot: createSnapshot() });
    expect(result).toHaveLength(6);
    expect(result.every((domain) => !domain.matched)).toBe(true);
  });
});
