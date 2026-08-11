/**
 * Monolith-side registration helper for service RouteDef lists.
 *
 * Host-local serves each service package's framework-neutral RouteDef list
 * through the Nest adapter so one definition serves both hosts. The
 * per-service probe/ownership endpoints (`/internal/health`, `/internal/live`,
 * `/internal/ready`, `/internal/readiness`, `/internal/ownership`,
 * `/internal/operator-status`) are excluded: in the modular monolith the
 * host owns those semantics at `/health`, `/live`, `/ready` and would collide
 * on duplicate paths across contexts.
 */

import type { RouteDef } from '@trapmap/backend-core';

const MONOLITH_EXCLUDED_PROBE_PATHS: ReadonlySet<string> = new Set([
  '/internal/health',
  '/internal/live',
  '/internal/ready',
  '/internal/readiness',
  '/internal/ownership',
  '/internal/operator-status',
]);

export function serviceRouteDefsForMonolith(routeDefs: RouteDef[]): RouteDef[] {
  return routeDefs.filter((route) => !MONOLITH_EXCLUDED_PROBE_PATHS.has(route.path));
}
