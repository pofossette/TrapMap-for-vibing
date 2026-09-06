import {
  createGovernanceReviewModule,
  type GovernanceAsyncCommandPort,
  type GovernanceConflictWorkflowPort,
  type GovernanceRetrievalProjection,
  type GovernanceReviewAdminPort,
  type GovernanceReviewDeps,
  type ReviewPort,
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

function optionalGovernanceExtensions(
  deps: Pick<
    GovernanceReviewServiceDeps,
    'admin' | 'asyncCommands' | 'conflictWorkflow' | 'governanceRetrievalProjection'
  >,
): {
  admin?: GovernanceReviewAdminPort;
  asyncCommands?: GovernanceAsyncCommandPort;
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
} {
  return {
    ...(deps.asyncCommands ? { asyncCommands: deps.asyncCommands } : {}),
    ...(deps.conflictWorkflow ? { conflictWorkflow: deps.conflictWorkflow } : {}),
    ...(deps.admin ? { admin: deps.admin } : {}),
    ...(deps.governanceRetrievalProjection
      ? { governanceRetrievalProjection: deps.governanceRetrievalProjection }
      : {}),
  };
}

export function createGovernanceReviewDeps(
  deps: GovernanceReviewPortDeps,
): GovernanceReviewServiceDeps {
  return {
    knowledgeWrite: deps.knowledgeWrite,
    feedbackRepo: deps.feedbackRepo,
    auditLog: deps.auditLog,
    ...optionalGovernanceExtensions(deps),
  };
}

export function createGovernanceReviewServiceModule(
  deps: GovernanceReviewServiceDeps,
): GovernanceReviewServiceModule {
  const review = createGovernanceReviewModule(deps);
  return {
    ...review,
    ...optionalGovernanceExtensions(deps),
  };
}
