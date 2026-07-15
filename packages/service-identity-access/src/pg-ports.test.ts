import { describe, expect, it, vi } from 'vitest';

import {
  createIdentityAccessActorLookupSource,
  createIdentityAccessOwnerBundle,
  createIdentityAccessPgDeps,
  createIdentityAccessSnapshotPort,
} from './pg-ports.js';
import { buildIdentityUserLookupContext } from './actor-lookup.js';
import { createAuditEvent } from './audit.js';
import { createIdentityAccessServiceModule } from './deps.js';

describe('identity PostgreSQL ports', () => {
  it('keeps all identity capabilities in a structural owner bundle', () => {
    const deps = createIdentityAccessPgDeps({ query: vi.fn(async () => ({ rows: [] })) } as never);

    expect(createIdentityAccessOwnerBundle(deps)).toMatchObject({
      sessionRepo: deps.sessionRepo,
      accessKeyRepo: deps.accessKeyRepo,
      teamRepo: deps.teamRepo,
      membershipRepo: deps.membershipRepo,
      userRepo: deps.userRepo,
      sessionLookup: deps.sessionLookup,
      teamLookup: deps.teamLookup,
      permissionCheck: deps.permissionCheck,
      auditLog: deps.auditLog,
      actorLookup: deps.actorLookup,
    });
  });

  it('maps membership reads to the shared repository contract', async () => {
    const deps = createIdentityAccessPgDeps({
      query: vi.fn(async () => ({
        rows: [
          {
            id: 'member_1',
            user_id: 'user_1',
            team_id: 'team_1',
            role_template: 'reviewer',
            security_level: 3,
            permissions: ['read:knowledge'],
            notes: null,
          },
        ],
      })),
    } as never);

    await expect(deps.membershipRepo.getById('member_1')).resolves.toMatchObject({
      userId: 'user_1',
      teamId: 'team_1',
      securityLevel: 3,
    });
  });

  it('builds a login-capable identity module from an owner-local pool', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users WHERE handle')) {
        return { rows: [{ id: 'user_1', handle: 'alice', notes: null }] };
      }
      if (sql.includes("nextval('session_id_seq')")) return { rows: [{ nextval: '7' }] };
      return { rows: [] };
    });
    const module = createIdentityAccessServiceModule(
      createIdentityAccessPgDeps({ query } as never, { systemAdminKey: 'admin-key' }),
    );

    await expect(module.login('alice', 'secret')).resolves.toMatchObject({
      userId: 'user_1',
      handle: 'alice',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sessions'),
      expect.any(Array),
    );
  });

  it('returns an unbounded audit total and performs actor membership lookup in one query', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ total: '3' }] };
      }
      if (sql.includes('FROM audit_events')) {
        return { rows: [{ id: 'audit_1', action: 'team:create', actor_id: 'user_1' }] };
      }
      if (sql.includes('FROM users WHERE id = ANY')) {
        return { rows: [{ id: 'user_1', handle: 'alice' }] };
      }
      if (sql.includes('FROM memberships')) {
        return { rows: [{ user_id: 'user_1', team_id: 'team_1', security_level: 4 }] };
      }
      return { rows: [] };
    });
    const deps = createIdentityAccessPgDeps({ query } as never);
    const audit = await deps.auditLog.query({ actorId: 'user_1', limit: 1 });
    const actors = await createIdentityAccessActorLookupSource({ query } as never).getUsersByIds([
      'user_1',
    ]);
    const memberships = await createIdentityAccessActorLookupSource({
      query,
    } as never).getMembershipLevels([
      { userId: 'user_1', teamId: 'team_1' },
      { userId: 'user_2', teamId: 'team_2' },
    ]);

    expect(audit.total).toBe(3);
    expect(actors).toEqual([{ id: 'user_1', handle: 'alice' }]);
    expect(memberships).toEqual(new Map([['user_1:team_1', 4]]));
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('FROM memberships')),
    ).toHaveLength(1);
  });

  it('exposes the temporary snapshot port without leaking a server store type', async () => {
    const snapshot = createIdentityAccessSnapshotPort({
      async read() {
        return {
          users: [],
          teams: [],
          memberships: [],
          sessions: [],
          accessKeys: [],
          auditEvents: [],
        };
      },
      async transact(work) {
        return work({
          users: [],
          teams: [],
          memberships: [],
          sessions: [],
          accessKeys: [],
          auditEvents: [],
        });
      },
      nextId(_snapshot, prefix) {
        return `${prefix}_1`;
      },
    });

    await expect(snapshot.read()).resolves.toEqual({
      users: [],
      teams: [],
      memberships: [],
      sessions: [],
      accessKeys: [],
      auditEvents: [],
    });
    await expect(snapshot.transact((data) => data.users.length)).resolves.toBe(0);
    expect(
      snapshot.nextId(
        { users: [], teams: [], memberships: [], sessions: [], accessKeys: [], auditEvents: [] },
        'user',
      ),
    ).toBe('user_1');
  });

  it('deduplicates actor lookup inputs across knowledge records', async () => {
    const source = {
      getUsersByIds: vi.fn(async () => [{ id: 'user_1', handle: 'alice' }]),
      getMembershipLevels: vi.fn(async () => new Map([['user_1:team_1', 3]])),
    };
    const result = await buildIdentityUserLookupContext(source, [
      {
        ownerUserId: 'user_1',
        teamId: 'team_1',
        history: [],
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        submissionHistory: [],
      },
    ]);

    expect(result.memberships).toEqual([{ userId: 'user_1', teamId: 'team_1', securityLevel: 3 }]);
  });

  it('creates audit records through an identity-owned structural snapshot port', () => {
    const event = createAuditEvent({
      store: { nextId: () => 'audit_1' },
      data: {},
      teamId: 'team_1',
      actor: { actorId: 'user_1' },
      action: 'team:create',
      entityId: 'team_1',
      payload: { slug: 'engineering' },
    });

    expect(event).toMatchObject({ id: 'audit_1', actorId: 'user_1', teamId: 'team_1' });
  });
});
