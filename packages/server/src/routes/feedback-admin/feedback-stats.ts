/**
 * GET /v1/operations/feedback/stats/:entryId — Quality score for a knowledge entry.
 */

import { type FeedbackListItem, feedbackStatsResponseSchema } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

import { computeAgeDays, computeQualityScore } from './helpers.js';

export function registerFeedbackStatsRoute(app: FastifyInstance) {
  app.get('/v1/operations/feedback/stats/:entryId', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Get path params
    const params = request.params as { entryId: string };
    const entryId = params.entryId;

    const {
      feedback: feedbackRepo,
      knowledge: knowledgeRepo,
      artifact: artifactRepo,
    } = app.skillShareer.repos;
    const now = new Date();

    // Find entry to determine type using repositories
    const knowledgeEntry = await knowledgeRepo.getById(entryId);
    const skillArtifact = knowledgeEntry ? null : await artifactRepo.getById(entryId);

    if (!knowledgeEntry && !skillArtifact) {
      throw new AppError(404, 'not_found', 'Entry not found');
    }

    const entryType = knowledgeEntry ? 'trap' : 'skill';
    const entryShortcut = knowledgeEntry?.shortcut ?? skillArtifact?.slug ?? 'unknown';

    // Filter feedback by entry ID using repository
    const entryFeedback = await feedbackRepo.listByEntry(entryId);

    // Compute quality score
    const quality = computeQualityScore(entryFeedback);

    // Get recent feedback (up to 10)
    const recentFeedback: FeedbackListItem[] = entryFeedback
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        entryId: f.entryId,
        entryType: f.entryType,
        entryShortcut,
        problemType: f.problemType,
        description: f.description,
        context: f.context,
        submittedAt: f.submittedAt,
        submittedBy: {
          id: f.submittedByUserId,
          handle: f.submittedByHandle,
          securityLevel: 0,
        },
        status: f.status,
        ageDays: Math.round(computeAgeDays(f.submittedAt, now)),
        adminNotes: f.adminNotes,
      }));

    return feedbackStatsResponseSchema.parse({
      entryId,
      entryType,
      quality,
      recentFeedback,
    });
  });
}
