import { loginResponseSchema } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import type { IdentityAccessDeps } from '../../../src/identity-access/application/module.js';
import { createIdentityAccessModule } from '../../../src/identity-access/application/module.js';
import type {
  MembershipRecord,
  SessionRecord,
  TeamRecord,
  UserRecord,
} from '../../../src/ports/repo-ports.js';

const TS = '2024-01-01T00:00:00Z';

function sessionFixture(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    subjectType: 'user',
    userId: 'user-1',
    tokenHash: 'token-1',
    activeTeamId: 'team-1',
    expiresAt: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function userFixture(overrides: Partial<UserRecord> = {}): UserRecord {
  return { id: 'user-1', handle: 'alice', notes: null, createdAt: TS, updatedAt: TS, ...overrides };
}

function membershipFixture(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return {
    id: 'member-1',
    userId: 'user-1',
    teamId: 'team-1',
    roleTemplate: 'admin',
    securityLevel: 5,
    permissions: ['knowledge:review'],
    notes: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function teamFixture(overrides: Partial<TeamRecord> = {}): TeamRecord {
  return {
    id: 'team-1',
    slug: 'alpha',
    name: 'Alpha',
    description: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

interface FakeDb {
  sessions: SessionRecord[];
  users: UserRecord[];
  memberships: MembershipRecord[];
  teams: TeamRecord[];
}

function createDeps(db: FakeDb): IdentityAccessDeps {
  const unused = (name: string): never => {
    throw new Error(`unexpected port call in describeSession test: ${name}`);
  };
  return {
    sessionRepo: {
      nextId: async () => 'session-x',
      create: async (session) => sessionFixture({ ...session, id: 'session-x' }),
      getByTokenHash: async (tokenHash) =>
        db.sessions.find((candidate) => candidate.tokenHash === tokenHash) ?? null,
      deleteByTokenHash: async () => undefined,
      updateActiveTeam: async () => sessionFixture(),
    },
    accessKeyRepo: {
      nextId: async () => unused('accessKeyRepo.nextId'),
      insert: async () => undefined,
      getByTokenHash: async () => null,
      getById: async () => null,
      revoke: async () => undefined,
      listByMember: async () => [],
    },
    teamRepo: {
      nextId: async () => 'team-x',
      insert: async () => undefined,
      getById: async (teamId) => db.teams.find((candidate) => candidate.id === teamId) ?? null,
      getBySlug: async () => null,
      listAll: async () => db.teams,
      update: async () => undefined,
    },
    membershipRepo: {
      nextId: async () => 'member-x',
      insert: async () => undefined,
      getById: async () => null,
      findByUserAndTeam: async () => null,
      listByUser: async (userId) => db.memberships.filter((m) => m.userId === userId),
      listByTeam: async () => [],
      update: async () => undefined,
    },
    userRepo: {
      nextId: async () => 'user-x',
      insert: async () => undefined,
      getById: async (userId) => db.users.find((candidate) => candidate.id === userId) ?? null,
      getByHandle: async () => null,
      update: async () => undefined,
    },
    sessionLookup: {
      resolveSession: async () => null,
    },
    teamLookup: {
      getTeam: async () => null,
      listTeamsForUser: async () => [],
    },
    permissionCheck: {
      resolvePermissions: async () => [],
      hasPermission: async () => false,
    },
    auditLog: {
      record: async () => undefined,
      query: async () => ({ items: [], total: 0 }),
    },
  };
}

describe('identity-access application describeSession', () => {
  it('composes a contract-valid session for system-admin tokens', async () => {
    const port = createIdentityAccessModule(
      createDeps({
        sessions: [
          sessionFixture({ subjectType: 'system-admin', userId: null, activeTeamId: null }),
        ],
        users: [],
        memberships: [],
        teams: [],
      }),
    );

    const session = await port.describeSession('token-1');

    expect(session).not.toBeNull();
    // The external login body must satisfy the strict contract.
    expect(() => loginResponseSchema.parse({ session })).not.toThrow();
    expect(session?.member.handle).toBe('system-admin');
    expect(session?.activeTeam).toBeNull();
    expect(session?.effectivePermissions).toContain('knowledge:submit');
  });

  it('composes membership, team, and permissions for user tokens', async () => {
    const port = createIdentityAccessModule(
      createDeps({
        sessions: [sessionFixture()],
        users: [userFixture()],
        memberships: [membershipFixture()],
        teams: [teamFixture()],
      }),
    );

    const session = await port.describeSession('token-1');

    expect(() => loginResponseSchema.parse({ session })).not.toThrow();
    expect(session?.sessionId).toBe('session-1');
    expect(session?.member).toMatchObject({
      id: 'member-1',
      teamId: 'team-1',
      handle: 'alice',
      roleTemplate: 'admin',
      isSystem: false,
    });
    expect(session?.activeTeam).toMatchObject({ id: 'team-1', slug: 'alpha' });
    // Role permissions union explicit membership permissions.
    expect(session?.member.permissions).toEqual(['knowledge:review']);
    expect(session?.effectivePermissions).toContain('knowledge:review');
    expect(session?.effectivePermissions).toContain('session:read');
  });

  it('returns null for unknown tokens, orphaned users, and memberless users', async () => {
    const orphanSessionPort = createIdentityAccessModule(
      createDeps({
        sessions: [sessionFixture({ tokenHash: 'orphan' })],
        users: [],
        memberships: [],
        teams: [],
      }),
    );
    expect(await orphanSessionPort.describeSession('orphan')).toBeNull();
    expect(await orphanSessionPort.describeSession('missing')).toBeNull();

    const memberlessPort = createIdentityAccessModule(
      createDeps({
        sessions: [sessionFixture()],
        users: [userFixture()],
        memberships: [],
        teams: [],
      }),
    );
    expect(await memberlessPort.describeSession('token-1')).toBeNull();
  });
});
