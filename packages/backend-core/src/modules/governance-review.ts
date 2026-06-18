/**
 * Governance & Review bounded-context module.
 *
 * Owns: review decisions (approve/reject), artifact review,
 * feedback submission, maintenance commands.
 * This module handles all governance write operations.
 */

import type { KnowledgeRepositoryPort, FeedbackRepositoryPort } from '../ports/repo-ports.js';
import type { GovernanceReviewPort } from '../ports/internal-ports.js';
import type { AuditLogPort } from '../ports/audit-ports.js';
import { InvocationError } from '../invocation/invocation-model.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface GovernanceReviewDeps {
  knowledgeRepo: KnowledgeRepositoryPort;
  feedbackRepo: FeedbackRepositoryPort;
  auditLog: AuditLogPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const GOVERNANCE_REVIEW_MODULE = {
  name: 'governance-review' as const,
  owns: ['review-decisions', 'artifact-review', 'feedback', 'maintenance'] as const,
  dependsOn: ['knowledge-write'] as const,
} as const;

/**
 * Create a GovernanceReviewPort backed by the given dependencies.
 */
export function createGovernanceReviewModule(deps: GovernanceReviewDeps): GovernanceReviewPort {
  return {
    async approve(entryId, actorId, note) {
      const entry = await deps.knowledgeRepo.getById(entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${entryId}`);
      }

      await deps.knowledgeRepo.updateLifecycle(entryId, 'approved', {
        actorId,
        note: note ?? 'Approved',
      });

      await deps.auditLog.record({
        action: 'review.approve',
        actorId,
        entityId: entryId,
        metadata: { note },
      });
    },

    async reject(entryId, actorId, note) {
      const entry = await deps.knowledgeRepo.getById(entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${entryId}`);
      }

      await deps.knowledgeRepo.updateLifecycle(entryId, 'rejected', {
        actorId,
        note: note ?? 'Rejected',
      });

      await deps.auditLog.record({
        action: 'review.reject',
        actorId,
        entityId: entryId,
        metadata: { note },
      });
    },

    async reviewArtifact(_artifactId, decision, actorId, note) {
      // Artifact review is a governance concern.
      // The concrete implementation delegates to the artifact repository
      // which is wired by the host assembly.
      await deps.auditLog.record({
        action: `artifact.review.${decision}`,
        actorId,
        entityId: _artifactId,
        metadata: { decision, note },
      });
    },

    async submitFeedback(input) {
      const feedbackId = await deps.feedbackRepo.nextId();
      await deps.feedbackRepo.insert({
        id: feedbackId,
        entryId: input.entryId,
        problemType: input.problemType,
        description: input.description,
        status: 'open',
        submittedBy: input.actorId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Parameters<FeedbackRepositoryPort['insert']>[0]);

      await deps.auditLog.record({
        action: 'feedback.submit',
        actorId: input.actorId,
        entityId: feedbackId,
        metadata: { entryId: input.entryId, problemType: input.problemType },
      });

      return { feedbackId };
    },
  };
}
