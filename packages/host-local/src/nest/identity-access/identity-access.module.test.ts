import 'reflect-metadata';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { IdentityAccessPort } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionFilter } from '../runtime/exception.filter.js';
import { RequestContextService } from '../runtime/request-context.service.js';
import { IdentityAccessModule } from './identity-access.module.js';

function createMockPort(): IdentityAccessPort {
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
  it('serves identity-access RouteDefs through the Nest adapter', async () => {
    const mockPort = createMockPort();
    const { app, fastifyApp } = await createTestApp(mockPort);

    const login = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(login.statusCode).toBe(200);
    expect(mockPort.login).toHaveBeenCalledWith('alice', 'secret');

    const teams = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/teams',
      headers: { authorization: 'Bearer test-token' },
      payload: { name: 'Alpha', slug: 'alpha', actorId: 'user-1' },
    });
    expect(teams.statusCode).toBe(201);

    const health = await fastifyApp.inject({
      method: 'GET',
      url: '/internal/health',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ service: 'identity-access', status: 'ok' });

    await app.close();
  });

  it('keeps credential routes open and guards the rest', async () => {
    const mockPort = createMockPort();
    const { app, fastifyApp } = await createTestApp(mockPort);

    const login = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/auth/login',
      payload: { handle: 'alice', password: 'secret' },
    });
    expect(login.statusCode).toBe(200);

    const systemAdminLogin = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/auth/system-admin-login',
      payload: { systemAdminKey: 'key' },
    });
    expect(systemAdminLogin.statusCode).toBe(200);

    const guardedWithoutSession = await fastifyApp.inject({
      method: 'POST',
      url: '/internal/teams',
      payload: { name: 'Alpha', slug: 'alpha', actorId: 'user-1' },
    });
    expect(guardedWithoutSession.statusCode).toBe(401);

    await app.close();
  });
});
