import { Module } from '@nestjs/common';

import type {
  IdentityAccessDeps,
  IdentityAccessPort,
} from '@trapmap/backend-core';
import { createIdentityAccessModule } from '@trapmap/backend-core';

import { IDENTITY_ACCESS_PORT } from './identity-access.tokens.js';

/**
 * Nest module for the identity-access bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory; the host assembly passes concrete repository and lookup
 * ports in via `forDeps`. No controller is wired here — the gateway
 * module picks up the `IDENTITY_ACCESS_PORT` provider.
 *
 * identity-access was deferred in Phase 1 (auth contract drift); the
 * module exists but controller surface lands in a follow-up change.
 */
@Module({})
export class IdentityAccessModule {
  static forDeps(deps: IdentityAccessDeps) {
    const port: IdentityAccessPort = createIdentityAccessModule(deps);

    return {
      module: IdentityAccessModule,
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
    return {
      module: IdentityAccessModule,
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
}
