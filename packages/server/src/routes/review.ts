import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildReviewQueueProjection } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

import { sendCompatibilityShellUnsupported } from './compatibility-shell.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
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

    reviewDecisionRequestSchema.parse(request.body);
    return sendCompatibilityShellUnsupported(
      reply,
      'knowledge review writes',
      'host-distributed authoritative review service',
    );
  });
};
