import { Module } from '@nestjs/common';

import { createNestAdapter, type IdentityAccessPort } from '@trapmap/backend-core';
import { createIdentityAccessRouteDefs } from '@trapmap/service-identity-access';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
import { IDENTITY_ACCESS_PORT } from './identity-access.tokens.js';

/**
 * The monolith keeps only the credential routes from the identity-access
 * RouteDef list: they carry no actor identity, so they are safe on the
 * public port. Every other `/internal/*` route (teams/members/access-key
 * management that trust a client-supplied actor) is filtered out — the
 * internal trust surface exists only behind the distributed gateway.
 */
const MONOLITH_IDENTITY_LOGIN_PATHS: ReadonlySet<string> = new Set([
  '/internal/auth/login',
  '/internal/auth/system-admin-login',
]);

/**
 * Nest module for the identity-access bounded context.
 *
 * The host receives an already assembled IdentityAccessPort from the
 * identity service package. The internal routes are defined once as
 * framework-neutral RouteDefs (service package) and registered here through
 * the shared Nest adapter; no hand-written controller exists for this
 * context. Only the two credential routes (login / system-admin-login)
 * survive the monolith filter; everything else on the identity surface is
 * `/v1`-mounted by the gateway module instead.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class IdentityAccessModule {
  static forPort(port: IdentityAccessPort) {
    return {
      module: IdentityAccessModule,
      controllers: [
        createNestAdapter(
          serviceRouteDefsForMonolith(createIdentityAccessRouteDefs(port), {
            allowInternalPaths: MONOLITH_IDENTITY_LOGIN_PATHS,
          }),
          port,
          {
            guards: [AuthGuard],
            openRoutes: ['/internal/auth/login', '/internal/auth/system-admin-login'],
          },
        ),
      ],
      providers: [
        {
          provide: IDENTITY_ACCESS_PORT,
          useValue: port,
        },
      ],
      exports: [IDENTITY_ACCESS_PORT],
      global: true,
    };
  }

  static forTesting(port: IdentityAccessPort) {
    return IdentityAccessModule.forPort(port);
  }
}
