/**
 * Route registration based on deployment profile.
 *
 * Reads the resolved runtime deployment to determine which route families
 * to register. Uses backend-core's route surface model to gate routes
 * based on capabilities.
 */

import type { FastifyInstance } from 'fastify';

import type {
  CandidateIngestionPort,
  IdentityAccessPort,
  JobRuntimePort,
  KnowledgeReadPort,
  ReviewPort,
  KnowledgeWritePort,
  RepositoryPorts,
  ResolvedRuntimeDeployment,
} from '@trapmap/backend-core';
import {
  buildRouteSurfaceSummary,
  getUnsupportedRouteDescriptors,
  resolveRouteFamilies,
} from '@trapmap/backend-core';

import { type GatewayHandlerDeps, registerGatewayRoutes } from '../http/gateway.js';
import { type HealthState, registerHealthRoutes } from '../http/health.js';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export interface RegisterRoutesOptions {
  app: FastifyInstance;
  deployment: ResolvedRuntimeDeployment;
  repos: RepositoryPorts | null;
  modules: {
    identityAccess: IdentityAccessPort;
    knowledgeRead: KnowledgeReadPort;
    knowledgeWrite: KnowledgeWritePort;
    candidateIngestion: CandidateIngestionPort;
    review: ReviewPort;
    jobRuntime: JobRuntimePort;
  };
}

/**
 * Register all routes based on the deployment profile.
 *
 * This function:
 * 1. Resolves which route families are available for the profile
 * 2. Registers health/status routes (always available)
 * 3. Registers gateway routes based on capabilities
 * 4. Logs unsupported route descriptors for the deployment profile
 */
export function registerRoutes(options: RegisterRoutesOptions): void {
  const { app, deployment, repos, modules } = options;

  // Resolve route surface
  const routeFamilies = resolveRouteFamilies(
    deployment.capabilities.routeSurface,
    deployment.capabilities.supportsReviewGovernance,
  );
  const surfaceSummary = buildRouteSurfaceSummary(deployment);

  // Health state for status endpoints
  const healthState: HealthState = {
    startedAt: new Date().toISOString(),
    deploymentProfile: deployment.deploymentProfile,
    runtimeMode: deployment.runtimeMode,
    routeSurface: surfaceSummary.routeSurface,
    publicGatewayRouteCount: surfaceSummary.publicGatewayRouteCount,
    internalRouteCount: surfaceSummary.internalRouteCount,
  };

  // Always register health routes
  registerHealthRoutes(app, healthState, repos);

  // Register gateway routes based on capabilities
  const gatewayDeps: GatewayHandlerDeps = {
    identityAccess: modules.identityAccess,
    knowledgeRead: modules.knowledgeRead,
    knowledgeWrite: modules.knowledgeWrite,
    candidateIngestion: modules.candidateIngestion,
    review: modules.review,
    jobRuntime: modules.jobRuntime,
  };
  registerGatewayRoutes(app, gatewayDeps, deployment);

  // Log unsupported routes for this profile
  const unsupportedRoutes = getUnsupportedRouteDescriptors(deployment.capabilities.routeSurface);
  if (unsupportedRoutes.length > 0) {
    app.log.info(
      {
        count: unsupportedRoutes.length,
        descriptors: unsupportedRoutes.map((d) => d.pathPrefix),
      },
      'Some routes are unsupported for this deployment profile',
    );
  }

  // Log route surface summary
  app.log.info(
    {
      profile: deployment.deploymentProfile,
      routeSurface: surfaceSummary.routeSurface,
      routeFamilies: routeFamilies.map((f) => f.kind),
      publicGatewayRouteCount: surfaceSummary.publicGatewayRouteCount,
      internalRouteCount: surfaceSummary.internalRouteCount,
    },
    'Route surface configured',
  );
}
