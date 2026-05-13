import { evidenceMetaSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';

/**
 * Evidence metadata routes for updating provenance on knowledge entries.
 */
export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{
    Params: { id: string };
    Body: { sourceType?: string; sourceRef?: string; evidenceLevel?: string };
  }>('/v1/knowledge/:id/evidence', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const { id } = request.params;
    const partialEvidence = request.body;

    const updatedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === id);
      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.teamId) {
        requireTeamAccess(auth, entry.teamId);
      }

      requireHigherLevel(auth, entry.requiredLevel);

      const now = nowIso();
      const reviewerActorRef = {
        id: auth.actorId,
        handle: auth.handle,
        securityLevel: auth.securityLevel,
      };

      // Merge with existing or create new
      const mergedEvidence = {
        sourceType:
          partialEvidence.sourceType ?? entry.evidenceMeta?.sourceType ?? 'internal-experience',
        sourceRef: partialEvidence.sourceRef ?? entry.evidenceMeta?.sourceRef ?? '',
        evidenceLevel:
          partialEvidence.evidenceLevel ?? entry.evidenceMeta?.evidenceLevel ?? 'anecdotal',
        verifiedAt: now,
        verifiedBy: reviewerActorRef,
      };

      // Validate with zod schema
      entry.evidenceMeta = evidenceMetaSchema.parse(mergedEvidence);
      entry.updatedAt = now;

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: entry.teamId,
        actor: auth,
        action: 'knowledge-reviewed',
        entityId: entry.id,
        payload: {
          evidenceUpdate: true,
          evidence: entry.evidenceMeta,
        },
      });
      data.auditEvents.push(auditEvent);

      return entry;
    });

    return { evidence: updatedEntry.evidenceMeta };
  });
};
