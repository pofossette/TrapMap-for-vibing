import { Module } from '@nestjs/common';

import type { KnowledgeReadPort } from '@trapmap/backend-core';
import { createKnowledgeReadModule } from '@trapmap/backend-core';
import {
  type KnowledgeReadPortDeps,
  createKnowledgeReadDeps,
} from '@trapmap/service-knowledge-read';

import { KNOWLEDGE_READ_PORT } from './knowledge-read.tokens.js';

/**
 * Nest module for the knowledge-read bounded context.
 *
 * Phase 2 cutover: the Nest module consumes the backend-core factory
 * directly. The read-side projection adapter (`createKnowledgeReadDeps`)
 * is still sourced from `@trapmap/service-knowledge-read`, which is the
 * designated read-side thin assembly and projection-status owner for
 * the modular-monolith window.
 *
 * The host assembly passes concrete `knowledgeRepo` and
 * `retrievalQuery` ports via `forDeps`; no controller is wired here —
 * the gateway module picks up the `KNOWLEDGE_READ_PORT` provider.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class KnowledgeReadModule {
  static forDeps(deps: KnowledgeReadPortDeps) {
    const knowledgeReadDeps = createKnowledgeReadDeps(deps);
    const port: KnowledgeReadPort = createKnowledgeReadModule(knowledgeReadDeps);

    return {
      module: KnowledgeReadModule,
      providers: [
        {
          provide: KNOWLEDGE_READ_PORT,
          useValue: port,
        },
      ],
      exports: [KNOWLEDGE_READ_PORT],
      global: true,
    };
  }

  /**
   * For testing: register a mock/stub port directly.
   */
  static forTesting(port: KnowledgeReadPort) {
    return {
      module: KnowledgeReadModule,
      providers: [
        {
          provide: KNOWLEDGE_READ_PORT,
          useValue: port,
        },
      ],
      exports: [KNOWLEDGE_READ_PORT],
      global: true,
    };
  }
}
