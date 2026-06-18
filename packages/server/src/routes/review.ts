import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createReviewApplicationService } from '@trapmap/server/lib/knowledge/review-application-service.js';
import { createLifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import { buildReviewQueueProjection } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  const { store, eventBus, asyncTransport } = app.skillShareer;
  function getReviewService() {
    return createReviewApplicationService({
      repos: {
        knowledge: app.skillShareer.repos.knowledge,
        audit: app.skillShareer.repos.audit,
        user: app.skillShareer.repos.user,
        membership: app.skillShareer.repos.membership,
      },
      lifecyclePublisher: createLifecyclePublisher(
        asyncTransport
          ? {
              store,
              eventBus,
              asyncTransport: {
                events: asyncTransport.events,
              },
            }
          : {
              store,
              eventBus,
            },
      ),
      feedbackRepo: app.skillShareer.repos.feedback,
    });
  }

  app.get('/v1/knowledge/review-queue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const rawQuery = (request.query as Record<string, string | undefined>) ?? {};
    const projection = await buildReviewQueueProjection(
      app.skillShareer.repos,
      rawQuery.status !== undefined
        ? {
            auth,
            status: rawQuery.status,
          }
        : { auth },
    );

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { itemCount: projection.items.length, status: rawQuery.status },
    });

    return reviewQueueResponseSchema.parse({
      items: projection.items,
      nextCursor: null,
      total: projection.total,
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
      ...(payload.boundary !== null ? { boundary: payload.boundary } : {}),
      ...(normalizedEvidence !== undefined ? { evidence: normalizedEvidence } : {}),
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
