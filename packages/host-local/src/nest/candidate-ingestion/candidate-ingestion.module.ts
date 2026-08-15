import { Module } from '@nestjs/common';

import type { CandidateIngestionDeps, CandidateIngestionPort } from '@trapmap/backend-core';
import { createCandidateIngestionModule, createNestAdapter } from '@trapmap/backend-core';
import { createCandidateIngestionRouteDefs } from '@trapmap/service-candidate-ingestion';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
import { CANDIDATE_INGESTION_PORT } from './candidate-ingestion.tokens.js';

/**
 * Nest module for the candidate-ingestion bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. The host assembly is responsible for wiring the
 * `KnowledgeWritePort` and optional `JobRuntimePort` providers into
 * `deps` before this module is registered.
 *
 * The service package's RouteDef list is registered through the shared
 * Nest adapter (probe routes excluded, monolith owns /health) and guarded
 * by the host session guard.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class CandidateIngestionModule {
  static forDeps(deps: CandidateIngestionDeps) {
    const port: CandidateIngestionPort = createCandidateIngestionModule(deps);
    return CandidateIngestionModule.options(port);
  }

  static forTesting(port: CandidateIngestionPort) {
    return CandidateIngestionModule.options(port);
  }

  private static options(port: CandidateIngestionPort) {
    return {
      module: CandidateIngestionModule,
      controllers: [
        createNestAdapter(
          serviceRouteDefsForMonolith(createCandidateIngestionRouteDefs(port)),
          port,
          { guards: [AuthGuard] },
        ),
      ],
      providers: [
        {
          provide: CANDIDATE_INGESTION_PORT,
          useValue: port,
        },
      ],
      exports: [CANDIDATE_INGESTION_PORT],
      global: true,
    };
  }
}
