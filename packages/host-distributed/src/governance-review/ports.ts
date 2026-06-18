import type { GovernanceReviewDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '../shared/ports.js';

export function createGovernanceReviewDeps(
  ports: ServicePortImplementations,
): GovernanceReviewDeps {
  return {
    knowledgeRepo: ports.repos.knowledge,
    feedbackRepo: ports.repos.feedback,
    auditLog: ports.auditLog,
  };
}
