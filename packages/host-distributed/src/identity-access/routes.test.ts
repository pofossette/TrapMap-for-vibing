import type { IdentityAccessPort } from '@trapmap/backend-core';
import { registerIdentityAccessRoutes } from '@trapmap/service-identity-access';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

function createModule(overrides: Partial<IdentityAccessPort> = {}): IdentityAccessPort {
  return {
    login: vi.fn(async () => ({ sessionToken: 'session-1', userId: 'user-1', handle: 'alice' })),
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
