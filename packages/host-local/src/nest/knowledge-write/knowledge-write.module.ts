import { Module } from '@nestjs/common';

import type {
  KnowledgeWriteDeps,
  KnowledgeWritePort,
} from '@trapmap/backend-core';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';

import { KNOWLEDGE_WRITE_PORT } from './knowledge-write.tokens.js';

/**
 * Nest module for the knowledge-write bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. Authoritative aggregate mutation truth lives in this module;
 * governance-review and candidate-ingestion reach it through the
 * `KNOWLEDGE_WRITE_PORT` provider rather than through a repo seam.
 */
@Module({})
export class KnowledgeWriteModule {
  static forDeps(deps: KnowledgeWriteDeps) {
    const port: KnowledgeWritePort = createKnowledgeWriteModule(deps);

    return {
      module: KnowledgeWriteModule,
      providers: [
        {
          provide: KNOWLEDGE_WRITE_PORT,
          useValue: port,
        },
      ],
      exports: [KNOWLEDGE_WRITE_PORT],
      global: true,
    };
  }

  static forTesting(port: KnowledgeWritePort) {
    return {
      module: KnowledgeWriteModule,
      providers: [
        {
          provide: KNOWLEDGE_WRITE_PORT,
          useValue: port,
        },
      ],
      exports: [KNOWLEDGE_WRITE_PORT],
      global: true,
    };
  }
}
