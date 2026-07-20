import { Module } from '@nestjs/common';

import type { ReviewPort } from '@trapmap/backend-core';
import {
  createGovernanceReviewServiceModule,
  type GovernanceReviewServiceDeps,
} from '@trapmap/service-governance-review';

import { GOVERNANCE_REVIEW_PORT } from './governance-review.tokens.js';

/**
 * Nest module for the governance-review bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. Final aggregate mutations are delegated to the
 * `KNOWLEDGE_WRITE_PORT` provider passed in through deps; the host
 * assembly is responsible for wiring that provider before this module.
 */
@Module({})
export class GovernanceReviewModule {
  static forDeps(deps: GovernanceReviewServiceDeps) {
    const port: ReviewPort = createGovernanceReviewServiceModule(deps);

    return {
      module: GovernanceReviewModule,
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
