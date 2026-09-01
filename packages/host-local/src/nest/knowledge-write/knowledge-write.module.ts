import { Module } from '@nestjs/common';

import {
  type KnowledgeWriteDeps,
  type KnowledgeWritePort,
  createNestAdapter,
} from '@trapmap/backend-core';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';
import { createKnowledgeWriteRouteDefs } from '@trapmap/service-knowledge-write';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
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
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class KnowledgeWriteModule {
  static forDeps(deps: KnowledgeWriteDeps) {
    const port: KnowledgeWritePort = createKnowledgeWriteModule(deps);
    return KnowledgeWriteModule.options(port);
  }

  static forTesting(port: KnowledgeWritePort) {
    return KnowledgeWriteModule.options(port);
  }

  private static options(port: KnowledgeWritePort) {
    return {
      module: KnowledgeWriteModule,
      controllers: [
        createNestAdapter(
          serviceRouteDefsForMonolith(
            createKnowledgeWriteRouteDefs(
              port as unknown as Parameters<typeof createKnowledgeWriteRouteDefs>[0], // lib type gap: dynamic admin port probe
            ),
          ),
          port as unknown as Parameters<typeof createKnowledgeWriteRouteDefs>[0], // lib type gap: dynamic admin port probe
          {
            guards: [AuthGuard],
          },
        ),
      ],
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
