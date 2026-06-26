import { Module } from '@nestjs/common';

import type {
  GovernanceReviewDeps,
  ReviewPort,
} from '@trapmap/backend-core';
import { createGovernanceReviewModule } from '@trapmap/backend-core';

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
  static forDeps(deps: GovernanceReviewDeps) {
    const port: ReviewPort = createGovernanceReviewModule(deps);

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
