import { Module } from '@nestjs/common';

import { type ReviewPort, createNestAdapter } from '@trapmap/backend-core';
import {
  type GovernanceReviewServiceDeps,
  type GovernanceReviewServiceModule,
  createGovernanceReviewRouteDefs,
  createGovernanceReviewServiceModule,
} from '@trapmap/service-governance-review';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
import { GOVERNANCE_REVIEW_PORT } from './governance-review.tokens.js';

/**
 * Nest module for the governance-review bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. Final aggregate mutations are delegated to the
 * `KNOWLEDGE_WRITE_PORT` provider passed in through deps; the host
 * assembly is responsible for wiring that provider before this module.
 *
 * The service package's RouteDef list is registered through the shared
 * Nest adapter (probe routes excluded, monolith owns /health) and guarded
 * by the host session guard.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class GovernanceReviewModule {
  static forDeps(deps: GovernanceReviewServiceDeps) {
    const port: GovernanceReviewServiceModule = createGovernanceReviewServiceModule(deps);

    return {
      module: GovernanceReviewModule,
      controllers: [
        createNestAdapter(
          serviceRouteDefsForMonolith(createGovernanceReviewRouteDefs(port)),
          port,
          {
            guards: [AuthGuard],
          },
        ),
      ],
      providers: [
        {
          provide: GOVERNANCE_REVIEW_PORT,
          useValue: port,
        },
      ],
      exports: [GOVERNANCE_REVIEW_PORT],
      global: true,
    };
  }

  static forTesting(port: ReviewPort) {
    return {
      module: GovernanceReviewModule,
      controllers: [
        createNestAdapter(
          serviceRouteDefsForMonolith(createGovernanceReviewRouteDefs(port)),
          port,
          {
            guards: [AuthGuard],
          },
        ),
      ],
      providers: [
        {
          provide: GOVERNANCE_REVIEW_PORT,
          useValue: port,
        },
      ],
      exports: [GOVERNANCE_REVIEW_PORT],
      global: true,
    };
  }
}
