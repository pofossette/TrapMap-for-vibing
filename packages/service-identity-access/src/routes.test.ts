import { type IdentityAccessPort, InvocationError } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerIdentityAccessRoutes } from './routes.ts';

function createModule(overrides: Partial<IdentityAccessPort> = {}): IdentityAccessPort {
  return {
    login: vi.fn(async () => ({ sessionToken: 'session-1', userId: 'user-1', handle: 'alice' })),
    loginSystemAdmin: vi.fn(async () => ({ sessionToken: 'system-session-1' })),
    logout: vi.fn(async () => undefined),
    validateSession: vi.fn(async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      handle: 'alice',
      activeTeamId: null,
      securityLevel: 1,
    })),
    selectTeam: vi.fn(async () => undefined),
    createTeam: vi.fn(async () => ({ teamId: 'team-1' })),
    listTeams: vi.fn(async () => [{ id: 'team-1', slug: 'alpha', name: 'Alpha' }]),
    addMember: vi.fn(async () => undefined),
    updateMember: vi.fn(async () => undefined),
    provisionAccessKey: vi.fn(async () => ({ keyId: 'key-1', token: 'token-1' })),
    ...overrides,
  };
}

async function buildApp(module: IdentityAccessPort) {
  const app = Fastify();
  registerIdentityAccessRoutes(app, module);
  await app.ready();
  return app;
}

describe('service-identity-access routes', () => {
  it('issues a system-admin session only through the dedicated internal route', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/auth/system-admin-login',
      payload: { systemAdminKey: 'correct-key' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessionToken: 'system-session-1' });
    expect(module.loginSystemAdmin).toHaveBeenCalledWith('correct-key');
    await app.close();
  });

  it('exposes auth, team, member, and access-key flows through the service module', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const login = await app.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(login.statusCode).toBe(200);
    expect(module.login).toHaveBeenCalledWith('alice', 'secret');

    const validate = await app.inject({
      method: 'POST',
      url: '/internal/auth/validate',
      payload: { sessionToken: 'session-1' },
    });
    expect(validate.statusCode).toBe(200);

    const createTeam = await app.inject({
      method: 'POST',
      url: '/internal/teams',
      payload: { name: 'Alpha', slug: 'alpha', actorId: 'user-1' },
    });
    expect(createTeam.statusCode).toBe(201);
    expect(module.createTeam).toHaveBeenCalledWith('Alpha', 'alpha', 'user-1');

    const listTeams = await app.inject({
      method: 'GET',
      url: '/internal/teams?userId=user-1',
    });
    expect(listTeams.statusCode).toBe(200);
    expect(module.listTeams).toHaveBeenCalledWith('user-1');

    const addMember = await app.inject({
      method: 'POST',
      url: '/internal/members',
      payload: { teamId: 'team-1', userId: 'user-2', role: 'editor', actorId: 'user-1' },
    });
    expect(addMember.statusCode).toBe(201);
    expect(module.addMember).toHaveBeenCalledWith('team-1', 'user-2', 'editor', 'user-1');

    const updateMember = await app.inject({
      method: 'PUT',
      url: '/internal/members/member-1',
      payload: { updates: { role: 'admin' }, actorId: 'user-1' },
    });
    expect(updateMember.statusCode).toBe(200);
    expect(module.updateMember).toHaveBeenCalledWith('member-1', { role: 'admin' }, 'user-1');

    const accessKey = await app.inject({
      method: 'POST',
      url: '/internal/access-keys',
      payload: { memberId: 'member-1', actorId: 'user-1' },
    });
    expect(accessKey.statusCode).toBe(201);
    expect(module.provisionAccessKey).toHaveBeenCalledWith('member-1', 'user-1');

    await app.close();
  });

  it('preserves 401 for empty validateSession and invocation error mappings', async () => {
    const validateOnly = await buildApp(
      createModule({
        validateSession: vi.fn(async () => null),
      }),
    );
    const unauthorized = await validateOnly.inject({
      method: 'POST',
      url: '/internal/auth/validate',
      payload: { sessionToken: 'expired' },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      error: 'Invalid or expired session',
      kind: 'auth',
    });
    await validateOnly.close();

    const unavailableApp = await buildApp(
      createModule({
        login: vi.fn(async () => {
          throw InvocationError.unavailable('identity unavailable');
        }),
      }),
    );
    const unavailable = await unavailableApp.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({
      error: 'identity unavailable',
      kind: 'unavailable',
    });
    await unavailableApp.close();
  });
});
