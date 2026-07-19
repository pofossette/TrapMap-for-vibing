import {
  type GovernanceConflictWorkflowPort,
  type GovernanceReviewAdminPort,
  type GovernanceReviewDeps,
  type GovernanceRetrievalProjection,
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
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
}

export type GovernanceReviewServiceDeps = GovernanceReviewDeps & {
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
};

export interface GovernanceReviewServiceModule extends ReviewPort {
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
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
    ...(deps.governanceRetrievalProjection
      ? { governanceRetrievalProjection: deps.governanceRetrievalProjection }
      : {}),
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
    ...(deps.governanceRetrievalProjection
      ? { governanceRetrievalProjection: deps.governanceRetrievalProjection }
      : {}),
  };
}
