import { Module } from '@nestjs/common';
import type { KnowledgeReadPort, ReviewPort } from '@trapmap/backend-core';
import { type CandidateIngestionPort, createNestAdapter } from '@trapmap/backend-core';
import { disabledExperienceGeneSearchResponse } from '@trapmap/contracts';
import type { CronServiceModule } from '@trapmap/service-cron';
import { createExperienceGeneRouteDefs } from '@trapmap/service-knowledge-read';

import { AuthGuard } from '../runtime/auth.guard.js';
import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from '../runtime/host-runtime.js';
import { createGatewayRouteDefs } from './gateway.route-defs.js';
import type { GatewayRouteDeps } from './gateway.route-kit.js';

export interface GatewayPorts {
  knowledgeRead: KnowledgeReadPort;
  candidateIngestion: CandidateIngestionPort;
  governanceReview: ReviewPort;
  cron: CronServiceModule;
}

export function createHostLocalExperienceGeneGatewayDefs(
  deps: Parameters<typeof createExperienceGeneRouteDefs>[0],
) {
  return createExperienceGeneRouteDefs(deps).filter(
    (route) => route.path === '/v1/retrieval/genes/search',
  );
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
 *
 * The cron bounded context is aggregated here as `/v1/cron/*` routes over
 * its service module port (the same port the `CronModule` registers); the
 * scheduler lifecycle is owned by the CronModule provider, not the gateway.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class GatewayModule {
  static forRuntime(runtime: HostLocalRuntime, ports: GatewayPorts) {
    const searchGenes = runtime.services?.experienceGeneSearch?.searchGenes;
    const hasSearchGenes = typeof searchGenes === 'function';
    const mode = runtime.services?.config?.experienceGenesMode ?? 'off';
    if (mode !== 'off' && !runtime.services.experienceGeneSearch) {
      throw new Error(`experience gene ${mode} mode requires the in-process search port`);
    }
    const experienceGeneDeps = {
      mode,
      ...(hasSearchGenes
        ? { searchGenes }
        : { searchGenes: async () => disabledExperienceGeneSearchResponse() }),
    };
    const deps: GatewayRouteDeps & typeof experienceGeneDeps = {
      ...ports,
      runtime,
      ...experienceGeneDeps,
    };

    return {
      module: GatewayModule,
      controllers: [
        createNestAdapter(
          [
            ...createGatewayRouteDefs(deps),
            ...createHostLocalExperienceGeneGatewayDefs(experienceGeneDeps),
          ],
          deps,
          {
            guards: [AuthGuard],
            context: (request) => ({ authContext: request.authContext }),
          },
        ),
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
