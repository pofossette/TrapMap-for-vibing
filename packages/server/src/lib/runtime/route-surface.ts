import type { DeploymentRouteSurface, ResolvedRuntimeDeployment } from './deployment-profile.js';

export type RouteAudience = 'gateway-public' | 'internal-status';
export type RouteFamilyKind = 'gateway-api' | 'local-agent-minimal' | 'worker-status';

export interface UnsupportedRouteDescriptor {
  pathPrefix: string;
  capability: string;
  message: string;
}

export interface RouteFamilyDescriptor {
  kind: RouteFamilyKind;
  audience: RouteAudience;
  description: string;
  routes: readonly string[];
}

const minimalAgentGatewayRoutes = [
  'POST /v1/retrieval/search',
  'POST /v3/retrieval/search',
  'POST /v1/retrieval/skills/search-by-content',
] as const;

const coreGatewayApiRoutes = [
  'POST /v1/auth/login',
  'GET /v1/auth/session',
  'POST /v1/auth/logout',
  'POST /v1/teams',
  'GET /v1/teams',
  'POST /v1/teams/select',
  'POST /v1/members',
  'PATCH /v1/members/:memberId',
  'POST /v1/access-keys',
  'POST /v1/candidates',
  'GET /v1/candidates',
  'GET /v1/candidates/:candidateId',
  'POST /v1/candidates/:candidateId/apply-resolution',
  'GET /v1/duplicates',
  'GET /v1/duplicates/:candidateId',
  'POST /v1/traps',
  'GET /v1/traps',
  'GET /v1/traps/:trapId',
  'POST /v1/traps/:trapId/resubmit',
  'POST /v1/traps/:trapId/supersede',
  'POST /v1/knowledge',
  'GET /v1/knowledge/mine',
  'GET /v1/knowledge/:entryId',
  'POST /v1/knowledge/:entryId/resubmit',
  'PATCH /v1/knowledge/:entryId',
  'GET /v1/knowledge/review-queue',
  'POST /v1/knowledge/review',
] as const;

const governanceGatewayRoutes = [
  'POST /v1/knowledge/:entryId/supersede',
  'GET /v1/operations/audit',
  'GET /v1/operations/stats/usage',
  'GET /v1/operations/stats/hits',
  'GET /v1/operations/stats/summary',
  'POST /v1/operations/import',
  'POST /v1/operations/export',
  'GET /v1/operations/knowledge',
  'POST /v1/operations/knowledge/:entryId/deactivate',
  'POST /v1/operations/artifacts/:artifactId/edit',
  'GET /v1/operations/artifacts/:artifactId/history',
  'GET /v1/operations/artifacts/review-queue',
  'POST /v1/operations/artifacts/:artifactId/review',
  'POST /v1/candidates/:candidateId/manual-result',
  'POST /v1/feedback',
  'GET /v1/operations/feedback',
  'POST /v1/operations/feedback/batch',
  'GET /v1/operations/feedback/stats/:entryId',
  'GET /v1/operations/decay/entries',
  'POST /v1/operations/decay/batch',
  'POST /v1/operations/decay/search',
  'PATCH /v1/knowledge/:id/evidence',
  'GET /v1/operations/maintenance/entries',
  'POST /v1/operations/maintenance/batch',
  'POST /v1/admin/reconcile-knowledge-indexes',
  'POST /admin/boundary-search',
] as const;

const workerStatusRoutes = ['/health', '/ready', '/meta/routes'] as const;

const workerOnlyUnsupportedRoutes: readonly UnsupportedRouteDescriptor[] = [
  {
    pathPrefix: '/v1/',
    capability: 'gateway-public-api',
    message:
      'This runtime only exposes worker status routes; gateway business APIs are handled by the distributed gateway.',
  },
  {
    pathPrefix: '/v3/',
    capability: 'gateway-public-api',
    message:
      'This runtime only exposes worker status routes; gateway business APIs are handled by the distributed gateway.',
  },
] as const;

export function resolveRouteFamilies(
  routeSurface: DeploymentRouteSurface,
  supportsReviewGovernance: boolean,
): RouteFamilyDescriptor[] {
  if (routeSurface === 'worker-status') {
    return [
      {
        kind: 'worker-status',
        audience: 'internal-status',
        description: 'Internal worker/status-only surface without public gateway business APIs.',
        routes: workerStatusRoutes,
      },
    ];
  }

  if (routeSurface === 'minimal-agent') {
    return [
      {
        kind: 'local-agent-minimal',
        audience: 'gateway-public',
        description: 'Minimal local-agent gateway surface for retrieval-first CLI workflows.',
        routes: minimalAgentGatewayRoutes,
      },
    ];
  }

  return [
    {
      kind: 'gateway-api',
      audience: 'gateway-public',
      description: supportsReviewGovernance
        ? 'Full gateway API surface exposed to CLI and external clients.'
        : 'Core gateway API surface exposed to CLI and external clients.',
      routes: supportsReviewGovernance
        ? [...coreGatewayApiRoutes, ...minimalAgentGatewayRoutes, ...governanceGatewayRoutes]
        : [...coreGatewayApiRoutes, ...minimalAgentGatewayRoutes],
    },
  ];
}

export function flattenDocumentedRoutes(routeFamilies: readonly RouteFamilyDescriptor[]): string[] {
  return routeFamilies.flatMap((family) => [...family.routes]);
}

export function buildRouteSurfaceSummary(runtimeDeployment: ResolvedRuntimeDeployment): {
  routeSurface: DeploymentRouteSurface;
  routeFamilies: RouteFamilyDescriptor[];
  publicGatewayRouteCount: number;
  internalRouteCount: number;
} {
  const routeFamilies = resolveRouteFamilies(
    runtimeDeployment.capabilities.routeSurface,
    runtimeDeployment.capabilities.supportsReviewGovernance,
  );
  const publicGatewayRouteCount = routeFamilies
    .filter((family) => family.audience === 'gateway-public')
    .reduce((count, family) => count + family.routes.length, 0);
  const internalRouteCount = routeFamilies
    .filter((family) => family.audience === 'internal-status')
    .reduce((count, family) => count + family.routes.length, 0);

  return {
    routeSurface: runtimeDeployment.capabilities.routeSurface,
    routeFamilies,
    publicGatewayRouteCount,
    internalRouteCount,
  };
}

export function getUnsupportedRouteDescriptors(
  routeSurface: DeploymentRouteSurface,
): readonly UnsupportedRouteDescriptor[] {
  if (routeSurface === 'worker-status') {
    return workerOnlyUnsupportedRoutes;
  }

  return [];
}
