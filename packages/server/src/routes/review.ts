import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromRepos } from '@trapmap/server/lib/actors/lookup.js';
import { toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import { createReviewApplicationService } from '@trapmap/server/lib/knowledge/review-application-service.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  function getReviewService() {
    return createReviewApplicationService({
      repos: app.skillShareer.repos,
      store: app.skillShareer.store,
      eventBus: app.skillShareer.eventBus,
      feedbackRepo: app.skillShareer.repos.feedback,
    });
  }

  app.get('/v1/knowledge/review-queue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const rawQuery = (request.query as Record<string, string | undefined>) ?? {};
    const { knowledge: knowledgeRepo, user: userRepo } = app.skillShareer.repos;

    const allEntries = await knowledgeRepo.listByFilter({});
    const filteredEntries = allEntries.filter((entry) => {
      if (
        entry.teamId &&
        auth.subjectType !== 'system-admin' &&
        auth.activeTeamId !== entry.teamId
      ) {
        return false;
      }
      if (auth.subjectType !== 'system-admin' && auth.securityLevel <= entry.requiredLevel) {
        return false;
      }
      return rawQuery.status ? entry.lifecycleState === rawQuery.status : true;
    });

    const fullEntries = await Promise.all(
      filteredEntries.map(
        async (entrySummary) => (await knowledgeRepo.getById(entrySummary.id)) ?? entrySummary,
      ),
    );
    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, fullEntries);

    const queueItems = await Promise.all(
      fullEntries.map(async (entry) => {
        try {
          const owner = await userRepo.getById(entry.ownerUserId);
          if (!owner) return null;

          const lastDecision = entry.reviewHistory.at(-1) ?? null;
          const lastDecisionUserId = lastDecision?.decidedByUserId ?? owner.id;
          const lastDecisionUser =
            lastDecisionUserId === owner.id ? owner : await userRepo.getById(lastDecisionUserId);

          const serializedEntry = toKnowledgeEntry(lookup, entry);
          const latestSubmission = serializedEntry.latestSubmission;
          return {
            entry: serializedEntry,
            agentReview: entry.agentReview,
            submittedBy: latestSubmission?.submittedBy ?? serializedEntry.owner,
            latestSubmission,
            reviewNotes: serializedEntry.reviewNotes,
            lastDecision: lastDecision
              ? {
                  decidedAt: lastDecision.decidedAt,
                  decidedBy: {
                    id: lastDecisionUserId,
                    handle: lastDecisionUser?.handle ?? owner.handle,
                    securityLevel: entry.requiredLevel,
                  },
                  decision: lastDecision.decision,
                  notes: lastDecision.notes,
                }
              : null,
          };
        } catch (error) {
          if (error instanceof AppError && error.code === 'user_not_found') {
            return null;
          }
          throw error;
        }
      }),
    );

    const items = queueItems.filter((item): item is NonNullable<typeof item> => item !== null);

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { itemCount: items.length, status: rawQuery.status },
    });

    return reviewQueueResponseSchema.parse({
      items,
      nextCursor: null,
      total: items.length,
    });
  });

  app.post('/v1/knowledge/review', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const payload = reviewDecisionRequestSchema.parse(request.body);
    const appliedAt = nowIso();

    const normalizedEvidence =
      payload.evidence !== undefined
        ? {
            sourceType: payload.evidence.sourceType,
            evidenceLevel: payload.evidence.evidenceLevel,
            ...(payload.evidence.sourceRef !== undefined && {
              sourceRef: payload.evidence.sourceRef,
            }),
            ...(payload.evidence.verifiedAt !== undefined && {
              verifiedAt: payload.evidence.verifiedAt,
            }),
            ...(payload.evidence.verifiedBy !== undefined && {
              verifiedBy: payload.evidence.verifiedBy,
            }),
          }
        : undefined;

    const result = await getReviewService().applyDecision({
      actorId: auth.actorId,
      authContext: auth,
      entryId: payload.entryId,
      decision: payload.decision,
      notes: payload.notes,
      appliedAt,
      boundary: payload.boundary,
      evidence: normalizedEvidence,
    });

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: appliedAt,
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review',
      targetId: payload.entryId,
      teamId: auth.activeTeamId,
      metadata: { decision: payload.decision },
    });

    return { entry: result.entry };
  });
};
