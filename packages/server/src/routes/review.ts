import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { findTransitionEvent } from '../lib/lifecycle/transitions.js';
import { applyReviewDecision, toKnowledgeEntry } from '../lib/knowledge.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

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
                          candidate.id ===
                          (entry.reviewHistory.at(-1)?.decidedByUserId ?? owner.id),
                      )?.handle ?? owner.handle,
                    securityLevel: entry.requiredLevel,
                  },
                  decision: entry.reviewHistory.at(-1)?.decision,
                  notes: entry.reviewHistory.at(-1)?.notes,
                }
              : null,
        };
      });

    // Log user operation (fire-and-forget)
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

    // Capture transition context for post-commit indexing
    let entryId: string | undefined;
    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

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
      previousState = entry.lifecycleState;
      applyReviewDecision(
        payload.evidence !== undefined
          ? {
              store: app.skillShareer.store,
              data,
              entry,
              reviewerUserId: decidedByUserId,
              decidedAt,
              decision: payload.decision,
              notes: payload.notes,
              evidence: payload.evidence,
            }
          : {
              store: app.skillShareer.store,
              data,
              entry,
              reviewerUserId: decidedByUserId,
              decidedAt,
              decision: payload.decision,
              notes: payload.notes,
            },
      );

      // Update boundary if provided in payload
      if (payload.boundary !== undefined) {
        entry.boundary = payload.boundary;
      }

      // Capture entry ID and new state for post-commit indexing
      entryId = entry.id;
      nextState = entry.lifecycleState;

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: entry.teamId,
        actor: auth,
        action: 'knowledge-reviewed',
        entityId: entry.id,
        payload: {
          decision: payload.decision,
          notes: payload.notes,
          previousState,
          ...(payload.evidence !== undefined && { evidence: payload.evidence }),
        },
      });
      data.auditEvents.push(auditEvent);

      return toKnowledgeEntry(data, entry);
    });

    // Post-commit: dual-write + event emission
    if (entryId && previousState && nextState && previousState !== nextState) {
      // Dual-write: Update lifecycle in knowledge repository if available
      const knowledgeRepo = app.skillShareer.knowledgeRepo;
      if (knowledgeRepo) {
        try {
          await knowledgeRepo.updateLifecycle(entryId, nextState, {
            actorId: auth.actorId,
            note: `reviewer-${payload.decision}`,
          });
        } catch (repoError) {
          app.log.error(
            { repoError, entryId },
            'Failed to update lifecycle in knowledge repository',
          );
        }
      }

      // Emit domain event — subscribers handle indexing, conflict detection, audit
      const eventName = findTransitionEvent(previousState, nextState);
      if (eventName) {
        await app.skillShareer.eventBus.emitDomainEventAsync({
          name: eventName,
          entryId,
          previousState,
          nextState,
          actorId: auth.actorId,
          reason: `reviewer-${payload.decision}`,
          timestamp: nowIso(),
        });
      }
    }

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review',
      targetId: payload.entryId,
      teamId: auth.activeTeamId,
      metadata: { decision: payload.decision },
    });

    return { entry: reviewedEntry };
  });
};
