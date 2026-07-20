import {
  type GovernanceAsyncCommandPort,
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
  asyncCommands?: GovernanceAsyncCommandPort;
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
}

export type GovernanceReviewServiceDeps = GovernanceReviewDeps & {
  asyncCommands?: GovernanceAsyncCommandPort;
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
};

export interface GovernanceReviewServiceModule extends ReviewPort {
  asyncCommands?: GovernanceAsyncCommandPort;
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
    ...(deps.asyncCommands ? { asyncCommands: deps.asyncCommands } : {}),
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
    ...(deps.asyncCommands ? { asyncCommands: deps.asyncCommands } : {}),
    ...(deps.conflictWorkflow ? { conflictWorkflow: deps.conflictWorkflow } : {}),
    ...(deps.admin ? { admin: deps.admin } : {}),
    ...(deps.governanceRetrievalProjection
      ? { governanceRetrievalProjection: deps.governanceRetrievalProjection }
      : {}),
  };
}
