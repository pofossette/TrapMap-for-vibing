// @ts-nocheck
import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { registerFastifyRoutes } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { createGovernanceQueueRouteDefs } from './routes/queue.routes.js';
import { createGovernanceFeedbackRouteDefs } from './routes/feedback.routes.js';
import { createGovernanceMaintenanceRouteDefs } from './routes/maintenance.routes.js';
import { createGovernanceAdminRouteDefs as createAdminDefs } from './routes/admin.routes.js';
import { createGovernanceRuntimeRouteDefs } from './routes/runtime.routes.js';
import { createGovernanceJsonEditRouteDefs } from './routes/json-edit.routes.js';
import type { GovernanceReviewRouteDeps } from './routes/helpers.js';

export type {
  GovernanceReviewRouteDeps,
  GovernanceReviewRouteModule,
  GovernanceReviewReadinessOptions,
} from './routes/helpers.js';

export function createGovernanceAdminRouteDefs(
  deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    ...createGovernanceQueueRouteDefs(),
    ...createAdminDefs(),
    ...createGovernanceRuntimeRouteDefs(),
    ...createGovernanceJsonEditRouteDefs(),
  ];
}

export function createGovernanceReviewRouteDefsInternal(
  deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [...createGovernanceMaintenanceRouteDefs(), ...createGovernanceFeedbackRouteDefs()];
}

export function createGovernanceReviewRouteDefs(
  deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    ...createGovernanceReviewRouteDefsInternal(deps),
    ...createGovernanceAdminRouteDefs(deps),
  ];
}

export function registerGovernanceReviewRoutes(
  app: FastifyInstance,
  deps: GovernanceReviewRouteDeps,
): void {
  registerFastifyRoutes(app, createGovernanceReviewRouteDefs(deps), deps);
}

export * from './routes/helpers.js';
