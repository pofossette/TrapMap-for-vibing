import 'reflect-metadata';

import { type CanActivate, type ExecutionContext, Injectable, Module } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyInjectOptions, FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { InvocationError } from '../../../src/invocation/index.js';
import {
  type RouteDef,
  isRouteResponse,
  mapErrorToEnvelope,
  routeResponse,
} from '../../../src/http/route-contract.js';
import { createFastifyAdapter } from '../../../src/http/adapters/fastify.js';
import { RouteDefExceptionFilter, createNestAdapter } from '../../../src/http/adapters/nest.js';

const ADAPTERS = ['fastify', 'nest'] as const;
type AdapterName = (typeof ADAPTERS)[number];

interface AdapterTestApp {
  inject(options: FastifyInjectOptions): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

async function buildApp(
  routeDefs: RouteDef[],
  deps: unknown,
  adapter: AdapterName,
): Promise<AdapterTestApp> {
  if (adapter === 'fastify') {
    const app = createFastifyAdapter(routeDefs, deps);
    await app.ready();
    return {
      inject: (options) => app.inject(options),
      close: () => app.close(),
    };
  }

  @Module({ controllers: [createNestAdapter(routeDefs, deps)] })
  class AdapterTestModule {}

  const moduleRef = await Test.createTestingModule({ imports: [AdapterTestModule] }).compile();
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

describe.each(ADAPTERS)('RouteDef adapters (%s adapter)', (adapter) => {
  it('assembles params/query/body into the validated RouteContext', async () => {
    const handler = vi.fn(async () => ({ received: true }));
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/things/:thingId',
        schema: z.object({
          params: z.object({ thingId: z.string() }),
          query: z.object({ verbose: z.string().optional() }),
          body: z.object({ name: z.string() }),
        }),
        handler,
      },
    ];

    const app = await buildApp(routeDefs, undefined, adapter);
    const response = await app.inject({
      method: 'POST',
      url: '/things/thing-1?verbose=yes',
      payload: { name: 'alpha' },
    });

    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    const ctx = handler.mock.calls[0]![0];
    expect(ctx.params).toEqual({ thingId: 'thing-1' });
    expect(ctx.query).toEqual({ verbose: 'yes' });
    expect(ctx.body).toEqual({ name: 'alpha' });
    await app.close();
  });

  it('applies the RouteDef successStatus', async () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/things',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        successStatus: 201,
        handler: async () => ({ created: true }),
      },
    ];

    const app = await buildApp(routeDefs, undefined, adapter);
    const response = await app.inject({ method: 'POST', url: '/things', payload: {} });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ created: true });
    await app.close();
  });

  it('honors explicit routeResponse status over the default', async () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/things',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        handler: async () => routeResponse(401, { error: 'invalid', kind: 'auth' }),
      },
    ];

    const app = await buildApp(routeDefs, undefined, adapter);
    const response = await app.inject({ method: 'POST', url: '/things', payload: {} });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'invalid', kind: 'auth' });
    await app.close();
  });

  it('maps InvocationError kinds to status and error body', async () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'GET',
        path: '/unavailable',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        handler: async () => {
          throw InvocationError.unavailable('downstream down');
        },
      },
      {
        method: 'GET',
        path: '/conflict',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        handler: async () => {
          throw InvocationError.conflict('already exists');
        },
      },
      {
        method: 'GET',
        path: '/boom',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        handler: async () => {
          throw new Error('unexpected');
        },
      },
    ];

    const app = await buildApp(routeDefs, undefined, adapter);

    const unavailable = await app.inject({ method: 'GET', url: '/unavailable' });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ error: 'downstream down', kind: 'unavailable' });

    const conflict = await app.inject({ method: 'GET', url: '/conflict' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'already exists', kind: 'conflict' });

    const boom = await app.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json()).toMatchObject({ error: 'Internal server error', kind: 'internal' });

    await app.close();
  });

  it('maps Zod schema failures to 400 validation errors', async () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/things',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.object({ name: z.string() }),
        }),
        handler: async () => ({ ok: true }),
      },
    ];

    const app = await buildApp(routeDefs, undefined, adapter);
    const missingBody = await app.inject({ method: 'POST', url: '/things', payload: {} });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toMatchObject({
      error: 'Request validation failed',
      kind: 'validation',
    });
    await app.close();
  });
});

describe('Fastify adapter error wire', () => {
  it('renders the full canonical envelope including requestId', async () => {
    const routeDefs: RouteDef[] = [
      {
        method: 'GET',
        path: '/unavailable',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
        }),
        handler: async () => {
          throw InvocationError.conflict('already exists');
        },
      },
    ];

    const app = createFastifyAdapter(routeDefs, undefined);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/unavailable' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'conflict',
      message: 'already exists',
      kind: 'conflict',
      error: 'already exists',
    });
    expect(response.json().requestId).toEqual(expect.any(String));
    await app.close();
  });

  it('passes host context fields through the adapter into the validated context', async () => {
    const handler = vi.fn(async () => ({ received: true }));
    const routeDefs: RouteDef[] = [
      {
        method: 'GET',
        path: '/actor',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
          actor: z.object({ id: z.string().optional() }).optional(),
        }),
        handler,
      },
    ];

    const app = createFastifyAdapter(routeDefs, undefined, undefined, {
      context: (request) => ({ actor: { id: (request as { actorId?: string }).actorId } }),
    });
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/actor' });
    expect(response.statusCode).toBe(200);
    expect(handler.mock.calls[0]![0].actor).toEqual({ id: undefined });
    await app.close();
  });
});

describe('Nest adapter guards and context', () => {
  @Injectable()
  class TestGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<{ guarded?: boolean }>();
      request.guarded = true;
      return true;
    }
  }

  it('applies guards to every route except openRoutes', async () => {
    const guardedHandler = vi.fn(async () => ({ guarded: true }));
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/open',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
          guarded: z.boolean().optional(),
        }),
        handler: async (ctx) => ({ guarded: ctx.guarded }),
      },
      {
        method: 'POST',
        path: '/guarded',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
          guarded: z.boolean().optional(),
        }),
        handler: guardedHandler,
      },
    ];

    @Module({
      controllers: [
        createNestAdapter(routeDefs, undefined, { guards: [TestGuard], openRoutes: ['/open'] }),
      ],
      providers: [TestGuard],
    })
    class GuardTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [GuardTestModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const fastifyApp = app.getHttpAdapter().getInstance() as FastifyInstance;
    await fastifyApp.ready();

    const open = await fastifyApp.inject({ method: 'POST', url: '/open' });
    expect(open.json()).toEqual({ guarded: undefined });

    const guarded = await fastifyApp.inject({ method: 'POST', url: '/guarded' });
    expect(guarded.json()).toEqual({ guarded: true });
    expect(guardedHandler).toHaveBeenCalledOnce();

    await app.close();
  });

  it('passes host context fields into the validated context', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const routeDefs: RouteDef[] = [
      {
        method: 'POST',
        path: '/ctx',
        schema: z.object({
          params: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          body: z.unknown(),
          authContext: z.unknown(),
        }),
        handler,
      },
    ];

    @Module({
      controllers: [
        createNestAdapter(routeDefs, undefined, {
          context: (request) => ({ authContext: request.authContext }),
        }),
      ],
    })
    class ContextTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [ContextTestModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const fastifyApp = app.getHttpAdapter().getInstance() as FastifyInstance;
    await fastifyApp.ready();

    await fastifyApp.inject({
      method: 'POST',
      url: '/ctx',
      headers: { authorization: 'Bearer token' },
    });
    expect(handler.mock.calls[0]![0].authContext).toBeUndefined();
    await app.close();
  });
});

describe('RouteDef contract helpers', () => {
  it('brands and detects route responses', () => {
    const success = routeResponse(201, { teamId: 'team-1' });
    expect(isRouteResponse(success)).toBe(true);
    expect(success.status).toBe(201);
    expect(success.body).toEqual({ teamId: 'team-1' });
    expect(isRouteResponse({ status: 201, body: { teamId: 'team-1' } })).toBe(false);
    expect(isRouteResponse(null)).toBe(false);
  });

  it('maps unknown errors to the canonical 500 envelope', () => {
    const mapped = mapErrorToEnvelope(new Error('kaboom'));
    expect(mapped.status).toBe(500);
    expect(mapped.envelope).toMatchObject({
      code: 'internal_error',
      message: 'Internal server error',
      kind: 'internal',
    });
  });

  it('maps Zod errors to the canonical validation envelope with issues', () => {
    const schema = z.object({ handle: z.string() });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const mapped = mapErrorToEnvelope(parsed.error);
      expect(mapped.status).toBe(400);
      expect(mapped.envelope).toMatchObject({
        code: 'validation_error',
        kind: 'validation',
        message: 'Request validation failed',
      });
      expect(mapped.envelope.details).toBeDefined();
    }
  });
});
