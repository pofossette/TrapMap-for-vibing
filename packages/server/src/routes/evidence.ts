import { evidenceMetaSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

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

    const entry = await app.skillShareer.knowledgeOwner.getById(id);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (entry.teamId) {
      requireTeamAccess(auth, entry.teamId);
    }
    requireHigherLevel(auth, entry.requiredLevel);

    const evidence = evidenceMetaSchema.parse({
      sourceType:
        partialEvidence.sourceType ?? entry.evidenceMeta?.sourceType ?? 'internal-experience',
      ...((partialEvidence.sourceRef ?? entry.evidenceMeta?.sourceRef)
        ? { sourceRef: partialEvidence.sourceRef ?? entry.evidenceMeta?.sourceRef }
        : {}),
      evidenceLevel:
        partialEvidence.evidenceLevel ?? entry.evidenceMeta?.evidenceLevel ?? 'anecdotal',
      verifiedAt: new Date().toISOString(),
      verifiedBy: {
        id: auth.actorId,
        handle: auth.handle,
        securityLevel: auth.securityLevel,
      },
    });
    const result = await app.skillShareer.knowledgeOwner.reviewEvidence(id, evidence, auth.actorId);

    return { evidence: result.evidence };
  });
};
