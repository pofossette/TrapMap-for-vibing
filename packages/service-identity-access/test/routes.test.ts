import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  createFastifyAdapter,
  createNestAdapter,
  type IdentityAccessPort,
  InvocationError,
  RouteDefExceptionFilter,
} from '@trapmap/backend-core';
import type { FastifyInjectOptions, FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityAccessRouteDefs } from '../src/routes.ts';

const ADAPTERS = ['fastify', 'nest'] as const;
type AdapterName = (typeof ADAPTERS)[number];

interface RouteTestApp {
  inject(options: FastifyInjectOptions): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

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
    describeSession: vi.fn(async () => TEST_SESSION),
    ...overrides,
  };
}

async function buildApp(module: IdentityAccessPort, adapter: AdapterName): Promise<RouteTestApp> {
  const routeDefs = createIdentityAccessRouteDefs(module);

  if (adapter === 'fastify') {
    const app = createFastifyAdapter(routeDefs, module);
    await app.ready();
    return {
      inject: (options) => app.inject(options),
      close: () => app.close(),
    };
  }

  class RouteDefTestModule {}
  // NOTE: functional form — `@Module()` syntax breaks Vite 8/oxc transform on
  // Node without decorator support; `Module()` is metadata-only so identical.
  Module({ controllers: [createNestAdapter(routeDefs, module)] })(RouteDefTestModule);

  const moduleRef = await Test.createTestingModule({ imports: [RouteDefTestModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalFilters(new RouteDefExceptionFilter());
  await app.init();
  const fastifyApp = app.getHttpAdapter().getInstance() as FastifyInstance;
  await fastifyApp.ready();
  return {
    inject: (options) => fastifyApp.inject(options),
    close: () => app.close(),
  };
}

describe.each(ADAPTERS)('service-identity-access routes (%s adapter)', (adapter) => {
  it('issues a system-admin session only through the dedicated internal route', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/auth/system-admin-login',
      payload: { systemAdminKey: 'correct-key' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ session: TEST_SESSION, sessionToken: 'system-session-1' });
    expect(module.loginSystemAdmin).toHaveBeenCalledWith('correct-key');
    expect(module.describeSession).toHaveBeenCalledWith('system-session-1');
    await app.close();
  });

  it('exposes auth, team, member, and access-key flows through the service module', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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
      adapter,
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
      adapter,
    );
    const unavailable = await unavailableApp.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      error: 'identity unavailable',
      kind: 'unavailable',
    });
    await unavailableApp.close();
  });
});
