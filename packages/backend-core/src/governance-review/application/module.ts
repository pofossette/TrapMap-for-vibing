/**
 * Governance-review bounded context — application layer.
 *
 * Owns review decisions, governance eligibility flows, feedback
 * submission and operator-facing maintenance / decay commands. Final
 * knowledge aggregate mutations are delegated to knowledge-write through
 * the KnowledgeWritePort.
 */

import type { AuditLogPort } from '../../ports/audit-ports.js';
import type { KnowledgeWritePort, ReviewPort } from '../../ports/internal-ports.js';
import type { FeedbackRepositoryPort } from '../../ports/repo-ports.js';

import {
  GOVERNANCE_REVIEW_OWNED_CAPABILITIES,
  GOVERNANCE_REVIEW_SHORTHAND,
} from '../domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface GovernanceReviewDeps {
  knowledgeWrite: Pick<
    KnowledgeWritePort,
    | 'approveReviewDecision'
    | 'rejectReviewDecision'
    | 'applyMaintenanceDecision'
    | 'applyDecayDecision'
  >;
  feedbackRepo: FeedbackRepositoryPort;
  auditLog: AuditLogPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const GOVERNANCE_REVIEW_MODULE = {
  name: GOVERNANCE_REVIEW_SHORTHAND,
  owns: GOVERNANCE_REVIEW_OWNED_CAPABILITIES,
  dependsOn: ['knowledge-write'] as const,
} as const;

/**
 * Create a ReviewPort backed by the given dependencies.
 */
export function createGovernanceReviewModule(deps: GovernanceReviewDeps): ReviewPort {
  return {
    async approve(input) {
      const result = await deps.knowledgeWrite.approveReviewDecision(input);

      await deps.auditLog.record({
        action: 'review.approve',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { note: input.note, evidence: input.evidence ?? null },
      });

      return result;
    },

    async reject(input) {
      const result = await deps.knowledgeWrite.rejectReviewDecision(input);

      await deps.auditLog.record({
        action: 'review.reject',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { note: input.note, evidence: input.evidence ?? null },
      });

      return result;
    },

    async applyMaintenance(input) {
      const result = await deps.knowledgeWrite.applyMaintenanceDecision(input);

      await deps.auditLog.record({
        action: 'review.maintenance',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: {
          action: input.action,
          note: input.note,
          evidence: input.evidence ?? null,
        },
      });

      return result;
    },

    async applyDecay(input) {
      const result = await deps.knowledgeWrite.applyDecayDecision(input);

      await deps.auditLog.record({
        action: 'review.decay',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: {
          action: input.action,
          note: input.note,
          evidence: input.evidence ?? null,
        },
      });

      return result;
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
      const submittedAt = new Date().toISOString();
      const record = input as typeof input & Record<string, unknown>;
      await deps.feedbackRepo.insert({
        id: feedbackId,
        entryId: input.entryId,
        entryType: record.entryType === 'skill' ? 'skill' : 'trap',
        problemType: input.problemType,
        description: input.description,
        context: record.context ?? null,
        querySeed: record.querySeed ?? null,
        queryId: record.queryId ?? null,
        routeFamily: record.routeFamily ?? null,
        failureClassification: record.failureClassification ?? null,
        expectedCorrection: record.expectedCorrection ?? null,
        selectedResultSnapshot: record.selectedResultSnapshot ?? null,
        customAnswers: record.customAnswers ?? null,
        submittedAt,
        submittedByUserId: input.actorId,
        submittedByHandle:
          typeof record.submittedByHandle === 'string' ? record.submittedByHandle : input.actorId,
        status: 'new',
        adminNotes: null,
        resolvedAt: null,
        resolvedByUserId: null,
        triggeredTransition: null,
        remediationStatus: null,
        remediationOpenedAt: null,
        remediationOpenedByUserId: null,
        remediationResolvedAt: null,
        remediationResolvedByUserId: null,
        createdAt: submittedAt,
        updatedAt: submittedAt,
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
