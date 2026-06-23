import {
  knowledgeEntryResponseSchema,
  reviewDecisionRequestSchema,
  reviewQueueResponseSchema,
} from '@trapmap/contracts';
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
  const lifecyclePublisher = createLifecyclePublisher(
    asyncTransport
      ? {
          store,
          eventBus,
          asyncTransport,
        }
      : {
          store,
          eventBus,
        },
  );

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

  app.post('/v1/knowledge/review', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const body = reviewDecisionRequestSchema.parse(request.body);
    const reviewService = createReviewApplicationService({
      repos: {
        knowledge: app.skillShareer.repos.knowledge,
        audit: app.skillShareer.repos.audit,
        user: app.skillShareer.repos.user,
        membership: app.skillShareer.repos.membership,
      },
      lifecyclePublisher,
      feedbackRepo: app.skillShareer.repos.feedback,
    });

    const result = await reviewService.applyDecision({
      actorId: auth.actorId,
      authContext: auth,
      entryId: body.entryId,
      decision: body.decision,
      notes: body.notes,
      appliedAt: nowIso(),
      boundary: body.boundary ?? undefined,
      evidence: body.evidence,
    });

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review',
      targetId: body.entryId,
      teamId: auth.activeTeamId,
      metadata: {
        decision: body.decision,
        previousState: result.previousState,
        nextState: result.nextState,
      },
    });

    return reply.status(200).send(
      knowledgeEntryResponseSchema.parse({
        entry: result.entry,
      }),
    );
  });
};
