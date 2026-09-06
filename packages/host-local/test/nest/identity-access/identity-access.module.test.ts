import 'reflect-metadata';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { IdentityAccessPort } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { IdentityAccessModule } from '../../../src/nest/identity-access/identity-access.module.js';
import { AllExceptionFilter } from '../../../src/nest/runtime/exception.filter.js';
import { RequestContextService } from '../../../src/nest/runtime/request-context.service.js';

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

function createMockPort(): IdentityAccessPort {
  return {
    login: vi.fn(async () => ({ sessionToken: 'session-1', userId: 'user-1', handle: 'alice' })),
    loginSystemAdmin: vi.fn(async () => ({ sessionToken: 'system-session-1' })),
    describeSession: vi.fn(async () => TEST_SESSION),
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
  };
}

async function createTestApp(mockPort: IdentityAccessPort) {
  const moduleRef = await Test.createTestingModule({
    imports: [IdentityAccessModule.forPort(mockPort)],
    providers: [RequestContextService],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const requestContext = moduleRef.get(RequestContextService);
  app.useGlobalFilters(new AllExceptionFilter(requestContext));
  await app.init();
  const fastifyApp = app.getHttpAdapter().getInstance() as FastifyInstance;
  await fastifyApp.ready();
  return { app, fastifyApp };
}

describe('host-local identity-access module', () => {
  it('serves the credential login routes through the Nest adapter', async () => {
    const mockPort = createMockPort();
    const { app, fastifyApp } = await createTestApp(mockPort);

    const login = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(login.statusCode).toBe(200);
    expect(mockPort.login).toHaveBeenCalledWith('alice', 'secret');

    const systemAdminLogin = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/auth/system-admin-login',
      payload: { systemAdminKey: 'key' },
    });
    expect(systemAdminLogin.statusCode).toBe(200);
    expect(mockPort.loginSystemAdmin).toHaveBeenCalledWith('key');

    await app.close();
  });

  it('does not mount non-login internal routes on the monolith surface', async () => {
    const mockPort = createMockPort();
    const { app, fastifyApp } = await createTestApp(mockPort);

    const teams = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/teams',
      headers: { authorization: 'Bearer test-token' },
      payload: { name: 'Alpha', slug: 'alpha', actorId: 'user-1' },
    });
    expect(teams.statusCode).toBe(404);
    expect(mockPort.createTeam).not.toHaveBeenCalled();

    const health = await fastifyApp.inject({
      method: 'GET',
      url: '/internal/health',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(health.statusCode).toBe(404);

    const members = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/members',
      headers: { authorization: 'Bearer test-token' },
      payload: { teamId: 'team-1', userId: 'user-2', role: 'member', actorId: 'user-1' },
    });
    expect(members.statusCode).toBe(404);
    expect(mockPort.addMember).not.toHaveBeenCalled();

    await app.close();
  });
});
