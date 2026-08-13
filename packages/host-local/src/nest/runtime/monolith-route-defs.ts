/**
 * Monolith-side registration helper for service RouteDef lists.
 *
 * Host-local serves each service package's framework-neutral RouteDef list
 * through the Nest adapter so one definition serves both hosts. The whole
 * `/internal/*` surface (probes, ownership, and every service-internal
 * command route) is excluded: the monolith has no legitimate consumer for
 * it — the internal trust surface only exists in the distributed gateway
 * form, where the gateway auth hook resolves the actor and overwrites any
 * client-supplied identity header. Host-local is a single process with no
 * gateway layer, so exposing `/internal/*` on the public port would let
 * clients spoof the actor. The monolith keeps only the `/v1` gateway
 * surface plus the credential login routes (which carry no actor
 * identity); a narrow allowlist preserves exactly those login routes.
 */

import type { RouteDef } from '@trapmap/backend-core';

export interface MonolithRouteFilterOptions {
  /** `/internal/*` paths to keep in the monolith (credential routes only). */
  allowInternalPaths?: ReadonlySet<string>;
}

const NO_ALLOWED_INTERNAL_PATHS: ReadonlySet<string> = new Set();

export function serviceRouteDefsForMonolith(
  routeDefs: RouteDef[],
  options: MonolithRouteFilterOptions = {},
): RouteDef[] {
  const allowedInternalPaths = options.allowInternalPaths ?? NO_ALLOWED_INTERNAL_PATHS;
  return routeDefs.filter(
    (route) => !route.path.startsWith('/internal/') || allowedInternalPaths.has(route.path),
  );
}
