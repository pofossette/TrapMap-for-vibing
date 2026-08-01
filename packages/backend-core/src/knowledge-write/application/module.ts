/**
 * Knowledge-write bounded context — application layer.
 *
 * Owns knowledge / trap entry creation, resubmit, supersede, update,
 * review-decision application, maintenance / decay application and
 * candidate-result publication.
 */

import type { KnowledgeOwnerPort } from '@trapmap/contracts';
import { InvocationError } from '../../invocation/invocation-model.js';
import type { AuditLogPort } from '../../ports/audit-ports.js';
import type { KnowledgeWritePort } from '../../ports/internal-ports.js';

import { KNOWLEDGE_WRITE_OWNED_CAPABILITIES } from '../domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface KnowledgeWriteDeps {
  /** Authoritative aggregate owner. All commands delegate here atomically. */
  knowledgeOwner: KnowledgeOwnerPort;
  auditLog: AuditLogPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

export const KNOWLEDGE_WRITE_MODULE = {
  name: 'knowledge-write' as const,
  owns: KNOWLEDGE_WRITE_OWNED_CAPABILITIES,
  dependsOn: [] as const,
} as const;

/**
 * Create a KnowledgeWritePort backed by the given dependencies.
 */
export function createKnowledgeWriteModule(deps: KnowledgeWriteDeps): KnowledgeWritePort {
  const ownerEntry = async (entryId: string) => {
    const entry = await deps.knowledgeOwner.getById(entryId);
    if (!entry) {
      throw InvocationError.notFound(`Knowledge entry not found: ${entryId}`);
    }
    return entry;
  };

  return {
    async submit(input) {
      const { entryId } = await deps.knowledgeOwner.submit(input);

      await deps.auditLog.record({
        action: 'knowledge.submit',
        actorId: input.actorId,
        entityId: entryId,
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      });

      return { entryId };
    },

    async updateEntry(entryId, updates, actorId) {
      await ownerEntry(entryId);
      await deps.knowledgeOwner.updateEntry(entryId, updates, actorId);
      await deps.auditLog.record({
        action: 'knowledge.update',
        actorId,
        entityId: entryId,
      });
    },

    async resubmit(entryId, input, actorId) {
      await ownerEntry(entryId);
      await deps.knowledgeOwner.resubmit(entryId, input, actorId);
      await deps.auditLog.record({
        action: 'knowledge.resubmit',
        actorId,
        entityId: entryId,
      });
    },

    async supersede(entryId, replacementId, actorId) {
      await ownerEntry(entryId);
      await deps.knowledgeOwner.supersede(entryId, replacementId, actorId);
      await deps.auditLog.record({
        action: 'knowledge.supersede',
        actorId,
        entityId: entryId,
        metadata: { replacementId },
      });
    },

    async createTrap(input) {
      const { trapId } = await deps.knowledgeOwner.createTrap(input);

      await deps.auditLog.record({
        action: 'trap.create',
        actorId: input.actorId,
        entityId: trapId,
        teamId: input.teamId,
      });

      return { trapId };
    },

    async approveReviewDecision(input) {
      await ownerEntry(input.entryId);
      const result = await deps.knowledgeOwner.approveReviewDecision(input);

      await deps.auditLog.record({
        action: 'knowledge.review-approved',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { evidence: input.evidence ?? null, note: input.note ?? null },
      });

      return result;
    },

    async rejectReviewDecision(input) {
      await ownerEntry(input.entryId);
      const result = await deps.knowledgeOwner.rejectReviewDecision(input);

      await deps.auditLog.record({
        action: 'knowledge.review-rejected',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { evidence: input.evidence ?? null, note: input.note ?? null },
      });

      return result;
    },

    async applyMaintenanceDecision(input) {
      await ownerEntry(input.entryId);
      const result = await deps.knowledgeOwner.applyMaintenanceDecision(input);

      await deps.auditLog.record({
        action: 'knowledge.maintenance-applied',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: {
          action: input.action,
          evidence: input.evidence ?? null,
          note: input.note ?? null,
        },
      });

      return result;
    },

    async applyDecayDecision(input) {
      await ownerEntry(input.entryId);
      const result = await deps.knowledgeOwner.applyDecayDecision(input);

      await deps.auditLog.record({
        action: 'knowledge.decay-applied',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: {
          action: input.action,
          evidence: input.evidence ?? null,
          note: input.note ?? null,
        },
      });

      return result;
    },

    async publishCandidateResult(input) {
      await deps.auditLog.record({
        action: 'knowledge.candidate-result-published',
        actorId: input.actorId,
        entityId: input.candidateId,
        metadata: { result: input.result },
      });

      return { candidateId: input.candidateId };
    },

    async listTraps(teamId: string) {
      return (await deps.knowledgeOwner.listByFilter({ teamId })) as never;
    },

    async getTrap(trapId: string) {
      return (await deps.knowledgeOwner.getById(trapId)) as never;
    },
  };
}
