import { Module } from '@nestjs/common';

import type { CandidateIngestionDeps, CandidateIngestionPort } from '@trapmap/backend-core';
import { createCandidateIngestionModule } from '@trapmap/backend-core';

import { CANDIDATE_INGESTION_PORT } from './candidate-ingestion.tokens.js';

/**
 * Nest module for the candidate-ingestion bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. The host assembly is responsible for wiring the
 * `KnowledgeWritePort` and optional `JobRuntimePort` providers into
 * `deps` before this module is registered.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class CandidateIngestionModule {
  static forDeps(deps: CandidateIngestionDeps) {
    const port: CandidateIngestionPort = createCandidateIngestionModule(deps);

    return {
      module: CandidateIngestionModule,
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

  static forTesting(port: CandidateIngestionPort) {
    return {
      module: CandidateIngestionModule,
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
