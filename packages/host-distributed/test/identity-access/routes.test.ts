import type { IdentityAccessPort } from '@trapmap/backend-core';
import { registerIdentityAccessRoutes } from '@trapmap/service-identity-access';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const TEST_SESSION = {
  sessionId: 'session-1',
  member: {
    id: 'member-1',
    teamId: 'team-1',
    handle: 'alice',
    roleTemplate: 'admin',
    securityLevel: 5,
    permissions: [],
    notes: null,
    isSystem: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  activeTeam: {
    id: 'team-1',
    slug: 'alpha',
    name: 'Alpha',
    description: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  effectivePermissions: ['session:read'],
  expiresAt: null,
  issuedAt: '2024-01-01T00:00:00Z',
};

function createModule(overrides: Partial<IdentityAccessPort> = {}): IdentityAccessPort {
  return {
    login: vi.fn(async () => ({ sessionToken: 'session-1', userId: 'user-1', handle: 'alice' })),
    loginSystemAdmin: vi.fn(async () => ({ sessionToken: 'system-session-1' })),
    describeSession: vi.fn(async () => TEST_SESSION),
    logout: vi.fn(async () => undefined),
    validateSession: vi.fn(async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      handle: 'alice',
      activeTeamId: 'team-1',
      securityLevel: 1,
    })),
    selectTeam: vi.fn(async () => undefined),
    createTeam: vi.fn(async () => ({ teamId: 'team-1' })),
    listTeams: vi.fn(async () => []),
    addMember: vi.fn(async () => undefined),
    updateMember: vi.fn(async () => undefined),
    provisionAccessKey: vi.fn(async () => ({ keyId: 'key-1', token: 'token-1' })),
    ...overrides,
  };
}

describe('distributed identity-access bridge', () => {
  it('re-exports service-owned identity routes for host assembly', async () => {
    const module = createModule();
    const app = Fastify();
    registerIdentityAccessRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    expect(module.login).toHaveBeenCalledWith('alice', 'secret');
    await app.close();
  });
});
