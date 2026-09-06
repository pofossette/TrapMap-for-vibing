// @ts-nocheck
import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { registerFastifyRoutes } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import type { KnowledgeWriteRouteDeps } from './routes/helpers.js';
import { createKnowledgeKnowledgeRouteDefs } from './routes/knowledge.routes.js';
import { createKnowledgeSubmissionRouteDefs } from './routes/submission.routes.js';

export type { KnowledgeWriteReadinessOptions, KnowledgeWriteRouteDeps } from './routes/helpers.js';

export function createKnowledgeAdminRouteDefs(
  _deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  // For now, admin artifacts are in submission
  return createKnowledgeSubmissionRouteDefs().filter((r) => r.path.startsWith('/api/admin'));
}

export function createKnowledgeWriteRouteDefsInternal(
  _deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  return [
    ...createKnowledgeKnowledgeRouteDefs(),
    ...createKnowledgeSubmissionRouteDefs().filter((r) => !r.path.startsWith('/api/admin')),
  ];
}

export function createKnowledgeWriteRouteDefs(
  deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  return [...createKnowledgeWriteRouteDefsInternal(deps), ...createKnowledgeAdminRouteDefs(deps)];
}

export function registerKnowledgeWriteRoutes(
  app: FastifyInstance,
  deps: KnowledgeWriteRouteDeps,
): void {
  registerFastifyRoutes(app, createKnowledgeWriteRouteDefs(deps), deps);
}

export * from './routes/helpers.js';
