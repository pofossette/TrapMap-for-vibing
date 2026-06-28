import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
  knowledgeUpdateSchema,
  reviewDecisionRequestSchema,
  reviewerDecisionOutputSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromRepos } from '@trapmap/server/lib/actors/lookup.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { createKnowledgeRevision, toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import { createKnowledgeApplicationService } from '@trapmap/server/lib/knowledge/application-service.js';
import { createReviewApplicationService } from '@trapmap/server/lib/knowledge/review-application-service.js';
import { upsertKnowledgeEntryShadow } from '@trapmap/server/lib/knowledge/shadow-sync.js';
import { createLifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

function requireRealUser(userId: string | undefined): string {
  if (!userId) {
    throw new AppError(
      403,
      'user_required',
      'This workflow requires a real member account instead of the virtual system admin',
    );
  }

  return userId;
}

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  const { store, eventBus, asyncTransport } = app.skillShareer;
  const lifecyclePublisher = createLifecyclePublisher(
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
  );

  function getKnowledgeService() {
    return createKnowledgeApplicationService({
      knowledgeRepo: app.skillShareer.repos.knowledge,
      chatProvider: app.skillShareer.ai.chat,
    });
  }

  app.post('/v1/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');

    const payload = knowledgeSubmissionSchema.parse(request.body);
    const ownerUserId = requireRealUser(auth.user?.id);

    if (payload.scope === 'project' && !auth.activeTeamId) {
      throw new AppError(
        400,
        'active_team_required',
        'Project-scoped knowledge requires an active team',
      );
    }

    if (payload.requiredLevel !== undefined && payload.requiredLevel > auth.securityLevel) {
      throw new AppError(
        403,
        'required_level_too_high',
        'requiredLevel cannot exceed the submitter security level',
      );
    }

    const { entry } = await getKnowledgeService().submit({
      kind: 'knowledge',
      ownerUserId,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      payload,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
      boundary: payload.boundary,
    });

    await app.skillShareer.store.transact((data) => {
      upsertKnowledgeEntryShadow(data, entry);
    });

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [entry]);

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'submit',
      targetId: entry.id,
      teamId: auth.activeTeamId,
      metadata: { scope: payload.scope, labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });

  app.post('/v1/knowledge/review', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const payload = reviewDecisionRequestSchema.parse(request.body);
    const appliedAt = nowIso();
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
      entryId: payload.entryId,
      decision: payload.decision,
      notes: payload.notes,
      appliedAt,
      boundary: payload.boundary ?? undefined,
      evidence: payload.evidence,
    });

    const latestSubmission = result.entry.submissionHistory.at(-1) ?? null;
    const latestDecision = result.entry.reviewHistory.at(-1);
    if (!latestDecision) {
      throw new AppError(500, 'review_decision_missing', 'Review decision record missing');
    }

    return reviewerDecisionOutputSchema.parse({
      entry: result.entry,
      submission: latestSubmission,
      decision: latestDecision,
    });
  });

  app.get('/v1/knowledge/mine', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entries = await knowledgeRepo.listByFilter({ ownerUserId });

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, entries);
    const items = entries.map((entry) => toKnowledgeEntry(lookup, entry));

    return knowledgeHistoryResponseSchema.parse({ items });
  });

  app.get('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const entryId = (request.params as { entryId: string }).entryId;
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entry = await knowledgeRepo.getById(entryId);

    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    const isOwner = auth.user?.id === entry.ownerUserId;
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > entry.requiredLevel;

    if (!isOwner && !canReview) {
      throw new AppError(403, 'forbidden', 'You do not have access to this knowledge entry');
    }

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [entry]);
    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });

  app.post('/v1/knowledge/:entryId/resubmit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);
    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeResubmissionSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });

    const { entry } = await getKnowledgeService().resubmit({
      kind: 'knowledge',
      entryId,
      ownerUserId,
      payload,
    });

    await app.skillShareer.store.transact((data) => {
      upsertKnowledgeEntryShadow(data, entry);
    });

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [entry]);

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'resubmit', labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });
  app.patch('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeUpdateSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });

    // Capture transition context for post-commit indexing
    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;

    // Fetch entry from repo
    const existingEntry = await knowledgeRepo.getById(entryId);
    if (!existingEntry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (existingEntry.teamId) {
      requireTeamAccess(auth, existingEntry.teamId);
    }

    requireHigherLevel(
      auth,
      existingEntry.requiredLevel,
      payload.requiredLevel ?? existingEntry.requiredLevel,
    );

    const modifierId =
      auth.user?.id ??
      (() => {
        throw new AppError(403, 'user_required', 'System admin cannot author knowledge revisions');
      })();

    const submittedAt = nowIso();

    // Compute new values from payload, falling back to existing
    const newLabels = payload.labels ?? existingEntry.labels;
    const newShortcut = payload.shortcut ?? existingEntry.shortcut;
    const newDetail = payload.detail ?? existingEntry.detail;
    const newRequiredLevel = payload.requiredLevel ?? existingEntry.requiredLevel;

    // Capture previous state for indexing
    previousState = existingEntry.lifecycleState;
    nextState = existingEntry.lifecycleState; // update doesn't change state

    // Build revision record
    const revision = createKnowledgeRevision(
      modifierId,
      { detail: newDetail, labels: newLabels, shortcut: newShortcut },
      existingEntry.history.length + 1,
      submittedAt,
    );

    // Persist via PG repository (Round 2: repo methods handle InMemory via store.transact internally)
    await knowledgeRepo.appendRevision(entryId, revision);
    await knowledgeRepo.updateGovernance(entryId, {
      labels: newLabels,
      requiredLevel: newRequiredLevel,
    });

    // Build entry for response (use latest values)
    const entryForResponse: KnowledgeRecord = {
      ...existingEntry,
      labels: newLabels,
      shortcut: newShortcut,
      detail: newDetail,
      requiredLevel: newRequiredLevel,
      latestRevision: revision,
      history: [...existingEntry.history, revision],
      updatedAt: submittedAt,
    };

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [
      entryForResponse,
    ]);
    const updatedEntry = toKnowledgeEntry(lookup, entryForResponse);

    // Post-commit: emit event for index refresh on approved entries
    // Only refresh indexes for approved entries (IDX-05, T-11-04)
    if (previousState && nextState && nextState === 'approved') {
      await lifecyclePublisher.publishTransition({
        aggregateType: 'knowledge',
        aggregateId: entryId,
        previousState,
        nextState,
        actorId: auth.actorId,
        reason: 'updated',
      });
    }

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'update', scope: updatedEntry.scope, labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({ entry: updatedEntry });
  });

  app.post('/v1/knowledge/:entryId/supersede', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const entryId = (request.params as { entryId: string }).entryId;
    const body = (request.body as { replacementId?: string }) ?? {};
    if (!body.replacementId || typeof body.replacementId !== 'string') {
      throw new AppError(400, 'replacement_required', 'replacementId is required');
    }

    const entry = (
      await getKnowledgeService().supersede({
        kind: 'knowledge',
        entryId,
        replacementId: body.replacementId,
        actorId: auth.actorId,
      })
    ).entry;

    await lifecyclePublisher.publishTransition({
      aggregateType: 'knowledge',
      aggregateId: entryId,
      previousState: 'approved',
      nextState: 'deactivated',
      actorId: auth.actorId,
      reason: 'superseded',
    });

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'supersede',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { replacementId: body.replacementId },
    });

    const lookup = await buildUserLookupContextFromRepos(app.skillShareer.repos, [entry]);
    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });
};
