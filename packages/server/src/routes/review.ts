import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@skill-shareer/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { applyReviewDecision, toKnowledgeEntry } from '../lib/knowledge.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/knowledge/review-queue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const rawQuery = (request.query as Record<string, string | undefined>) ?? {};
    const data = await app.skillShareer.store.snapshot();
    const items = data.knowledgeEntries
      .filter((entry) => {
        if (entry.teamId && auth.subjectType !== 'system-admin') {
          requireTeamAccess(auth, entry.teamId);
        }

        if (auth.subjectType !== 'system-admin' && auth.securityLevel <= entry.requiredLevel) {
          return false;
        }

        return rawQuery.status ? entry.lifecycleState === rawQuery.status : true;
      })
      .map((entry) => {
        const owner = data.users.find((candidate) => candidate.id === entry.ownerUserId);

        if (!owner) {
          throw new AppError(404, 'owner_not_found', 'Entry owner not found');
        }

        return {
          entry: toKnowledgeEntry(data, entry),
          agentReview: entry.agentReview,
          submittedBy: {
            id: owner.id,
            handle: owner.handle,
            securityLevel: entry.requiredLevel,
          },
          lastDecision:
            entry.reviewHistory.length > 0
              ? {
                  decidedAt: entry.reviewHistory.at(-1)?.decidedAt,
                  decidedBy: {
                    id: entry.reviewHistory.at(-1)?.decidedByUserId ?? owner.id,
                    handle:
                      data.users.find(
                        (candidate) =>
                          candidate.id === (entry.reviewHistory.at(-1)?.decidedByUserId ?? owner.id)
                      )?.handle ?? owner.handle,
                    securityLevel: entry.requiredLevel,
                  },
                  decision: entry.reviewHistory.at(-1)?.decision,
                  notes: entry.reviewHistory.at(-1)?.notes,
                }
              : null,
        };
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
    const reviewedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === payload.entryId);

      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.teamId) {
        requireTeamAccess(auth, entry.teamId);
      }

      requireHigherLevel(auth, entry.requiredLevel);

      const decidedByUserId =
        auth.user?.id ??
        (() => {
          throw new AppError(403, 'user_required', 'System admin cannot author review decisions');
        })();

      const decidedAt = nowIso();
      const previousState = entry.lifecycleState;
      applyReviewDecision({
        store: app.skillShareer.store,
        data,
        entry,
        reviewerUserId: decidedByUserId,
        decidedAt,
        decision: payload.decision,
        notes: payload.notes,
      });

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: entry.teamId,
        actor: auth,
        action: 'knowledge-reviewed',
        entityId: entry.id,
        payload: { decision: payload.decision, notes: payload.notes, previousState },
      });
      data.auditEvents.push(auditEvent);

      return toKnowledgeEntry(data, entry);
    });

    return { entry: reviewedEntry };
  });
};
