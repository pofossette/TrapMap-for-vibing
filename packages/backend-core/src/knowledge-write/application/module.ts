/**
 * Knowledge-write bounded context — application layer.
 *
 * Owns knowledge / trap entry creation, resubmit, supersede, update,
 * review-decision application, maintenance / decay application and
 * candidate-result publication.
 */

import { InvocationError } from '@trapmap/backend-core/invocation/invocation-model.js';
import type { AuditLogPort } from '@trapmap/backend-core/ports/audit-ports.js';
import type { KnowledgeWritePort } from '@trapmap/backend-core/ports/internal-ports.js';
import type { KnowledgeRepositoryPort } from '@trapmap/backend-core/ports/repo-ports.js';

import { KNOWLEDGE_WRITE_OWNED_CAPABILITIES } from '@trapmap/backend-core/knowledge-write/domain/index.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface KnowledgeWriteDeps {
  knowledgeRepo: KnowledgeRepositoryPort;
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
  return {
    async submit(input) {
      const entryId = await deps.knowledgeRepo.nextId();
      const now = new Date().toISOString();
      await deps.knowledgeRepo.insert({
        id: entryId,
        content: input.content,
        title: input.title,
        labels: input.labels ?? [],
        teamId: input.teamId ?? null,
        ownerUserId: input.actorId,
        lifecycleState: 'submitted' as const,
        createdAt: now,
        updatedAt: now,
      } as Parameters<KnowledgeRepositoryPort['insert']>[0]);

      await deps.auditLog.record({
        action: 'knowledge.submit',
        actorId: input.actorId,
        entityId: entryId,
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      });

      return { entryId };
    },

    async updateEntry(entryId, updates, actorId) {
      const entry = await deps.knowledgeRepo.getById(entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${entryId}`);
      }
      if (!deps.knowledgeRepo.save) {
        throw InvocationError.internal('Repository does not support save operations');
      }
      await deps.knowledgeRepo.save({ ...entry, ...updates });
      await deps.auditLog.record({
        action: 'knowledge.update',
        actorId,
        entityId: entryId,
      });
    },

    async resubmit(entryId, _input, actorId) {
      const entry = await deps.knowledgeRepo.getById(entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${entryId}`);
      }
      await deps.knowledgeRepo.updateLifecycle(entryId, 'submitted', {
        actorId,
        note: 'Resubmitted for review',
      });
      await deps.auditLog.record({
        action: 'knowledge.resubmit',
        actorId,
        entityId: entryId,
      });
    },

    async supersede(entryId, replacementId, actorId) {
      await deps.knowledgeRepo.supersede(entryId, {
        replacementId,
        actorId,
      });
      await deps.auditLog.record({
        action: 'knowledge.supersede',
        actorId,
        entityId: entryId,
        metadata: { replacementId },
      });
    },

    async createTrap(input) {
      const trapId = await deps.knowledgeRepo.nextId();
      const now = new Date().toISOString();
      await deps.knowledgeRepo.insert({
        id: trapId,
        content: input.content,
        title: input.title,
        labels: input.labels ?? [],
        teamId: input.teamId,
        ownerUserId: input.actorId,
        lifecycleState: 'approved',
        entryType: 'trap',
        createdAt: now,
        updatedAt: now,
      } as Parameters<KnowledgeRepositoryPort['insert']>[0]);

      await deps.auditLog.record({
        action: 'trap.create',
        actorId: input.actorId,
        entityId: trapId,
        teamId: input.teamId,
      });

      return { trapId };
    },

    async approveReviewDecision(input) {
      const entry = await deps.knowledgeRepo.getById(input.entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${input.entryId}`);
      }

      await deps.knowledgeRepo.updateLifecycle(input.entryId, 'approved', {
        actorId: input.actorId,
        note: input.note ?? 'Approved',
      });

      await deps.auditLog.record({
        action: 'knowledge.review-approved',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { evidence: input.evidence ?? null, note: input.note ?? null },
      });

      return { entryId: input.entryId, lifecycleState: 'approved' };
    },

    async rejectReviewDecision(input) {
      const entry = await deps.knowledgeRepo.getById(input.entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${input.entryId}`);
      }

      await deps.knowledgeRepo.updateLifecycle(input.entryId, 'rejected', {
        actorId: input.actorId,
        note: input.note ?? 'Rejected',
      });

      await deps.auditLog.record({
        action: 'knowledge.review-rejected',
        actorId: input.actorId,
        entityId: input.entryId,
        metadata: { evidence: input.evidence ?? null, note: input.note ?? null },
      });

      return { entryId: input.entryId, lifecycleState: 'rejected' };
    },

    async applyMaintenanceDecision(input) {
      const entry = await deps.knowledgeRepo.getById(input.entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${input.entryId}`);
      }

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

      return { entryId: input.entryId, action: input.action };
    },

    async applyDecayDecision(input) {
      const entry = await deps.knowledgeRepo.getById(input.entryId);
      if (!entry) {
        throw InvocationError.notFound(`Knowledge entry not found: ${input.entryId}`);
      }

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

      return { entryId: input.entryId, action: input.action };
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
      return deps.knowledgeRepo.listByFilter({ teamId });
    },

    async getTrap(trapId: string) {
      return deps.knowledgeRepo.getById(trapId);
    },
  };
}
