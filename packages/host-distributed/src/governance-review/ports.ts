import type { GovernanceReviewDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '../shared/ports.js';

export function createGovernanceReviewDeps(
  ports: ServicePortImplementations,
): GovernanceReviewDeps {
  return {
    knowledgeWrite: {
      approveReviewDecision: async (input) =>
        ports.repos.knowledge
          .updateLifecycle(input.entryId, 'approved', {
            actorId: input.actorId,
            note: input.note,
          })
          .then(() => ({ entryId: input.entryId, lifecycleState: 'approved' as const })),
      rejectReviewDecision: async (input) =>
        ports.repos.knowledge
          .updateLifecycle(input.entryId, 'rejected', {
            actorId: input.actorId,
            note: input.note,
          })
          .then(() => ({ entryId: input.entryId, lifecycleState: 'rejected' as const })),
      applyMaintenanceDecision: async (input) => ({ entryId: input.entryId, action: input.action }),
      applyDecayDecision: async (input) => ({ entryId: input.entryId, action: input.action }),
    },
    feedbackRepo: ports.repos.feedback,
    auditLog: ports.auditLog,
  };
}
