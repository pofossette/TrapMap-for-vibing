import { Module } from '@nestjs/common';

import {
  type KnowledgeReadPort,
  createKnowledgeReadModule,
  createNestAdapter,
} from '@trapmap/backend-core';
import {
  type KnowledgeReadPortDeps,
  createKnowledgeReadDeps,
  createKnowledgeReadRouteDefs,
} from '@trapmap/service-knowledge-read';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
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
 * The service package's RouteDef list is registered through the shared
 * Nest adapter (probe routes excluded, monolith owns /health) and guarded
 * by the host session guard.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class KnowledgeReadModule {
  static forDeps(deps: KnowledgeReadPortDeps) {
    const knowledgeReadDeps = createKnowledgeReadDeps(deps);
    const port: KnowledgeReadPort = createKnowledgeReadModule(knowledgeReadDeps);
    return KnowledgeReadModule.options(port);
  }

  /**
   * For testing: register a mock/stub port directly.
   */
  static forTesting(port: KnowledgeReadPort) {
    return KnowledgeReadModule.options(port);
  }

  private static options(port: KnowledgeReadPort) {
    return {
      module: KnowledgeReadModule,
      controllers: [
        createNestAdapter(serviceRouteDefsForMonolith(createKnowledgeReadRouteDefs(port)), port, {
          guards: [AuthGuard],
        }),
      ],
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
