/**
 * Shared dual-adapter test harness for RouteDef route tests.
 *
 * `buildRouteTestApp` serves the same RouteDef list through either the
 * Fastify adapter (standalone service wire `{ error, kind }`) or the Nest
 * adapter (host-consumption wire, canonical envelope via
 * `RouteDefExceptionFilter`), so every service package's `routes.test.ts`
 * parametrizes its assertions over both adapters with one helper.
 */

import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyInjectOptions, FastifyInstance, LightMyRequestResponse } from 'fastify';

import {
  type RouteDef,
  RouteDefExceptionFilter,
  createFastifyAdapter,
  createNestAdapter,
} from '../http/index.js';

export const ADAPTER_NAMES = ['fastify', 'nest'] as const;
export type AdapterName = (typeof ADAPTER_NAMES)[number];

export interface RouteTestApp {
  inject(options: FastifyInjectOptions): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

export async function buildRouteTestApp(
  routeDefs: RouteDef[],
  deps: unknown,
  adapter: AdapterName,
): Promise<RouteTestApp> {
  if (adapter === 'fastify') {
    const app = createFastifyAdapter(routeDefs, deps);
    await app.ready();
    return {
      inject: (options) => app.inject(options),
      close: () => app.close(),
    };
  }

  @Module({ controllers: [createNestAdapter(routeDefs, deps)] })
  class RouteDefTestModule {}

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
