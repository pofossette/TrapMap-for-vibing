import { type GovernanceReviewDeps, createGovernanceReviewModule } from '@trapmap/backend-core';

export type { GovernanceReviewDeps } from '@trapmap/backend-core';

export interface GovernanceReviewPortDeps {
  knowledgeWrite: GovernanceReviewDeps['knowledgeWrite'];
  feedbackRepo: GovernanceReviewDeps['feedbackRepo'];
  auditLog: GovernanceReviewDeps['auditLog'];
}

export function createGovernanceReviewDeps(deps: GovernanceReviewPortDeps): GovernanceReviewDeps {
  return {
    knowledgeWrite: deps.knowledgeWrite,
    feedbackRepo: deps.feedbackRepo,
    auditLog: deps.auditLog,
  };
}

export function createGovernanceReviewServiceModule(deps: GovernanceReviewDeps) {
  return createGovernanceReviewModule(deps);
}
