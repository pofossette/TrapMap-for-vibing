import { Module } from '@nestjs/common';

import type { IdentityAccessPort } from '@trapmap/backend-core';

import { IDENTITY_ACCESS_PORT } from './identity-access.tokens.js';

/**
 * Nest module for the identity-access bounded context.
 *
 * The host receives an already assembled IdentityAccessPort from the
 * identity service package. No controller is wired here — the gateway
 * module picks up the `IDENTITY_ACCESS_PORT` provider.
 *
 * identity-access was deferred in Phase 1 (auth contract drift); the
 * module exists but controller surface lands in a follow-up change.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class IdentityAccessModule {
  static forPort(port: IdentityAccessPort) {
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
    return IdentityAccessModule.forPort(port);
  }
}
