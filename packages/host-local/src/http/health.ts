/**
 * Health check endpoints.
 *
 * Provides liveness and readiness probes for the light host.
 * Readiness checks backend-core port connectivity.
 */

import type { FastifyInstance } from 'fastify';

import type { RepositoryPorts } from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Health state
// ---------------------------------------------------------------------------

export interface HealthState {
  startedAt: string;
  deploymentProfile: string;
  runtimeMode: string;
  routeSurface: string;
  publicGatewayRouteCount: number;
  internalRouteCount: number;
}

// ---------------------------------------------------------------------------
// Health route registration
// ---------------------------------------------------------------------------

export function registerHealthRoutes(
  app: FastifyInstance,
  state: HealthState,
  repos?: RepositoryPorts | null,
): void {
  /**
   * Liveness probe — always 200 if the process is up.
   */
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      startedAt: state.startedAt,
      deploymentProfile: state.deploymentProfile,
      runtimeMode: state.runtimeMode,
    });
  });

  /**
   * Readiness probe — checks that the server is ready to accept traffic.
   * Verifies that backend-core ports are accessible.
   */
  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // Check knowledge repo connectivity
    if (repos) {
      try {
        await repos.knowledge.listByFilter({});
        checks.knowledgeRepo = { ok: true };
      } catch (error) {
        checks.knowledgeRepo = {
          ok: false,
          detail: error instanceof Error ? error.message : 'unknown error',
        };
      }
    }

    const allOk = Object.values(checks).every((c) => c.ok);

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'degraded',
      checks,
    });
  });

  /**
   * Route surface metadata — describes which routes are available.
   */
  app.get('/meta/routes', async (_request, reply) => {
    return reply.status(200).send({
      deploymentProfile: state.deploymentProfile,
      runtimeMode: state.runtimeMode,
      routeSurface: state.routeSurface,
      publicGatewayRouteCount: state.publicGatewayRouteCount,
      internalRouteCount: state.internalRouteCount,
    });
  });
}
