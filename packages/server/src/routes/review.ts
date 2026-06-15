import { reviewDecisionRequestSchema, reviewQueueResponseSchema } from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromRepos } from '@trapmap/server/lib/actors/lookup.js';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { emitCacheInvalidation } from '@trapmap/server/lib/cache/invalidation.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  getActiveEntryFeedback,
} from '@trapmap/server/lib/feedback/remediation.js';
import { applyReviewDecision, toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import { upsertKnowledgeEntryShadow } from '@trapmap/server/lib/knowledge/shadow-sync.js';
import { emitLifecycleTransition } from '@trapmap/server/lib/lifecycle/emit-transition.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const reviewRoutes: FastifyPluginAsync = async (app) => {
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

    let entryId: string | undefined;
    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const reviewSnapshot = await app.skillShareer.store.snapshot();
    const existingEntry =
      (await knowledgeRepo.getById(payload.entryId)) ??
      reviewSnapshot.knowledgeEntries.find((candidate) => candidate.id === payload.entryId) ??
      null;
    if (!existingEntry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (existingEntry.teamId) {
      requireTeamAccess(auth, existingEntry.teamId);
    }

    requireHigherLevel(auth, existingEntry.requiredLevel);

    const decidedByUserId =
      auth.user?.id ??
      (() => {
        throw new AppError(403, 'user_required', 'System admin cannot author review decisions');
      })();

    previousState = existingEntry.lifecycleState;
    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [existingEntry]);
    if (!lookup.users.some((user) => user.id === decidedByUserId)) {
      const reviewerUser = await app.skillShareer.repos.user.getById(decidedByUserId);
      if (!reviewerUser) {
        throw new AppError(404, 'user_not_found', 'User record not found');
      }
      lookup.users.push({ id: reviewerUser.id, handle: reviewerUser.handle });
    }
    if (existingEntry.teamId) {
      const reviewerMembership = await app.skillShareer.repos.membership.findByUserAndTeam(
        decidedByUserId,
        existingEntry.teamId,
      );
      if (
        reviewerMembership &&
        !lookup.memberships.some(
          (membership) =>
            membership.userId === decidedByUserId && membership.teamId === existingEntry.teamId,
        )
      ) {
        lookup.memberships.push({
          userId: decidedByUserId,
          teamId: existingEntry.teamId,
          securityLevel: reviewerMembership.securityLevel,
        });
      }
    }

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

    applyReviewDecision(
      normalizedEvidence !== undefined
        ? {
            data: lookup,
            entry: existingEntry,
            reviewerUserId: decidedByUserId,
            decidedAt: appliedAt,
            decision: payload.decision,
            notes: payload.notes,
            evidence: normalizedEvidence,
          }
        : {
            data: lookup,
            entry: existingEntry,
            reviewerUserId: decidedByUserId,
            decidedAt: appliedAt,
            decision: payload.decision,
            notes: payload.notes,
          },
    );

    if (payload.boundary !== undefined) {
      existingEntry.boundary = payload.boundary;
    }

    entryId = existingEntry.id;
    nextState = existingEntry.lifecycleState;

    const repoEntry = await knowledgeRepo.getById(payload.entryId);
    if (repoEntry) {
      await knowledgeRepo.updateLifecycle(payload.entryId, existingEntry.lifecycleState, {
        actorId: decidedByUserId,
        note: payload.notes,
      });
    }

    await app.skillShareer.store.transact((data) => {
      upsertKnowledgeEntryShadow(data, existingEntry);

      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: existingEntry.teamId,
        actor: auth,
        action: 'knowledge-reviewed',
        entityId: existingEntry.id,
        payload: {
          decision: payload.decision,
          notes: payload.notes,
          previousState,
          ...(payload.evidence !== undefined && { evidence: payload.evidence }),
        },
      });
      data.auditEvents.push(auditEvent);
    });

    if (entryId && previousState && nextState) {
      await emitLifecycleTransition({
        store: app.skillShareer.store,
        eventBus: app.skillShareer.eventBus,
        aggregateType: 'knowledge',
        aggregateId: entryId,
        previousState,
        nextState,
        actorId: auth.actorId,
        reason: `reviewer-${payload.decision}`,
      });
    }

    if (payload.decision === 'approve') {
      const { feedback: feedbackRepo } = app.skillShareer.repos;
      const entryFeedback = await feedbackRepo.listByEntry(payload.entryId);
      const unresolved = getActiveEntryFeedback(entryFeedback, payload.entryId);
      if (unresolved.length >= FEEDBACK_REMEDIATION_THRESHOLD) {
        for (const feedback of unresolved) {
          await feedbackRepo.update(feedback.id, {
            remediationStatus: 'ready-to-reindex',
            remediationResolvedAt: appliedAt,
            remediationResolvedByUserId: auth.user?.id ?? null,
          });
        }
        emitCacheInvalidation({
          sourceType: 'trap',
          sourceId: payload.entryId,
          reason: 'remediation-suppressed',
        });
      }
    }

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: appliedAt,
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review',
      targetId: payload.entryId,
      teamId: auth.activeTeamId,
      metadata: { decision: payload.decision },
    });

    const responseLookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [
      existingEntry,
    ]);
    return { entry: toKnowledgeEntry(responseLookup, existingEntry) };
  });
};
