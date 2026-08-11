import { Module } from '@nestjs/common';
import { type CandidateIngestionPort, createNestAdapter } from '@trapmap/backend-core';
import type { KnowledgeReadPort, ReviewPort } from '@trapmap/backend-core';

import { AuthGuard } from '../runtime/auth.guard.js';
import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from '../runtime/host-runtime.js';
import { type GatewayRouteDeps, createGatewayRouteDefs } from './gateway.route-defs.js';

export interface GatewayPorts {
  knowledgeRead: KnowledgeReadPort;
  candidateIngestion: CandidateIngestionPort;
  governanceReview: ReviewPort;
}

/**
 * Gateway module: external-facing HTTP surface.
 *
 * The `/v1` routes are defined once as framework-neutral RouteDefs
 * (`gateway.route-defs.ts`) and registered here through the shared Nest
 * adapter; no hand-written controller exists for this surface. Every route
 * is session-guarded via `AuthGuard` — 401 stays in the guard layer. The
 * adapter context extractor surfaces the guard-resolved auth context to the
 * RouteDef handlers.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class GatewayModule {
  static forRuntime(runtime: HostLocalRuntime, ports: GatewayPorts) {
    const deps: GatewayRouteDeps = { ...ports, runtime };

    return {
      module: GatewayModule,
      controllers: [
        createNestAdapter(createGatewayRouteDefs(deps), deps, {
          guards: [AuthGuard],
          context: (request) => ({ authContext: request.authContext }),
        }),
      ],
      providers: [
        {
          provide: HOST_LOCAL_RUNTIME_TOKEN,
          useValue: runtime,
        },
        AuthGuard,
      ],
      exports: [HOST_LOCAL_RUNTIME_TOKEN, AuthGuard],
      global: true,
    };
  }
}
