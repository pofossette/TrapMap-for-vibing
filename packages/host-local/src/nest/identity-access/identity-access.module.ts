import { Module } from '@nestjs/common';

import { type IdentityAccessPort, createNestAdapter } from '@trapmap/backend-core';
import { createIdentityAccessRouteDefs } from '@trapmap/service-identity-access';

import { AuthGuard } from '../runtime/auth.guard.js';
import { IDENTITY_ACCESS_PORT } from './identity-access.tokens.js';

/**
 * Nest module for the identity-access bounded context.
 *
 * The host receives an already assembled IdentityAccessPort from the
 * identity service package. The internal routes are defined once as
 * framework-neutral RouteDefs (service package) and registered here through
 * the shared Nest adapter; no hand-written controller exists for this
 * context. Every route requires a session except the two credential routes
 * (login / system-admin-login); 401 stays in the guard layer.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class IdentityAccessModule {
  static forPort(port: IdentityAccessPort) {
    return {
      module: IdentityAccessModule,
      controllers: [
        createNestAdapter(createIdentityAccessRouteDefs(port), port, {
          guards: [AuthGuard],
          openRoutes: ['/internal/auth/login', '/internal/auth/system-admin-login'],
        }),
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
