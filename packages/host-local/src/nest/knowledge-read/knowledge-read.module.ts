import { Module } from '@nestjs/common';

import {
  createKnowledgeReadDeps,
  createKnowledgeReadServiceModule,
} from '@trapmap/service-knowledge-read';
import type { KnowledgeReadDeps, KnowledgeReadPortDeps } from '@trapmap/service-knowledge-read';

import { KNOWLEDGE_READ_PORT } from './knowledge-read.tokens.js';

/**
 * Nest module for the knowledge-read bounded context.
 *
 * Phase 1 pilot: provides KnowledgeReadPort to the gateway controller.
 * The port implementation is selected by the adapter factory based on
 * the deployment profile (in-process for local/monolith, remote for distributed).
 *
 * Infrastructure deps (knowledgeRepo, retrievalQuery) are expected to be
 * provided by the host assembly via dynamic module registration.
 */
@Module({})
export class KnowledgeReadModule {
  static forDeps(deps: KnowledgeReadPortDeps) {
    const knowledgeReadDeps: KnowledgeReadDeps = createKnowledgeReadDeps(deps);
    const port = createKnowledgeReadServiceModule(knowledgeReadDeps);

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
  static forTesting(port: import('@trapmap/backend-core').KnowledgeReadPort) {
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
