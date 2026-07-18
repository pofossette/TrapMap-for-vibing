import {
  type GovernanceConflictWorkflowPort,
  type GovernanceReviewAdminPort,
  type GovernanceReviewDeps,
  type ReviewPort,
  createGovernanceReviewModule,
} from '@trapmap/backend-core';

export type { GovernanceReviewDeps } from '@trapmap/backend-core';

export interface GovernanceReviewPortDeps {
  knowledgeWrite: GovernanceReviewDeps['knowledgeWrite'];
  feedbackRepo: GovernanceReviewDeps['feedbackRepo'];
  auditLog: GovernanceReviewDeps['auditLog'];
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
}

export type GovernanceReviewServiceDeps = GovernanceReviewDeps & {
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
};

export interface GovernanceReviewServiceModule extends ReviewPort {
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
}

export function createGovernanceReviewDeps(
  deps: GovernanceReviewPortDeps,
): GovernanceReviewServiceDeps {
  return {
    knowledgeWrite: deps.knowledgeWrite,
    feedbackRepo: deps.feedbackRepo,
    auditLog: deps.auditLog,
    ...(deps.conflictWorkflow ? { conflictWorkflow: deps.conflictWorkflow } : {}),
    ...(deps.admin ? { admin: deps.admin } : {}),
  };
}

export function createGovernanceReviewServiceModule(
  deps: GovernanceReviewServiceDeps,
): GovernanceReviewServiceModule {
  const review = createGovernanceReviewModule(deps);
  return {
    ...review,
    ...(deps.conflictWorkflow ? { conflictWorkflow: deps.conflictWorkflow } : {}),
    ...(deps.admin ? { admin: deps.admin } : {}),
  };
}
