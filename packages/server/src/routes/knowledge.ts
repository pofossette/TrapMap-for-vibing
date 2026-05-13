import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
  knowledgeUpdateSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { supersedeEntry } from '../lib/decay/supersede.js';
import { AppError } from '../lib/errors.js';
import {
  createKnowledgeEntryRecord,
  resubmitKnowledgeEntry,
  toKnowledgeEntry,
  updateKnowledgeEntry,
} from '../lib/knowledge.js';
import { findTransitionEvent } from '../lib/lifecycle/transitions.js';
import { runPreReview } from '../lib/pre-review.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

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

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;

    const preReview = await runPreReview({
      existingEntries: await knowledgeRepo.listByFilter({}),
      submission: payload,
      chatProvider: app.skillShareer.ai.chat,
      authorBoundary: payload.boundary ?? null,
    });

    const createdAt = nowIso();

    // Use author boundary if provided, otherwise use extracted boundary from pre-review
    const boundary = payload.boundary ?? preReview.boundary ?? null;

    // Generate ID using repository
    const entryId = await knowledgeRepo.nextId();

    // store.transact() needed: createKnowledgeEntryRecord uses store.nextId() for sub-record IDs
    const { entry, record } = await app.skillShareer.store.transact((data) => {
      const rec = createKnowledgeEntryRecord({
        store: app.skillShareer.store,
        data,
        ownerUserId,
        teamId: payload.scope === 'project' ? auth.activeTeamId : null,
        payload,
        requiredLevel: payload.requiredLevel ?? auth.securityLevel,
        createdAt,
        preReview,
        boundary,
        idOverride: entryId,
      });

      data.knowledgeEntries.push(rec);

      return { entry: toKnowledgeEntry(data, rec), record: rec };
    });

    await knowledgeRepo.insert(record);

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'submit',
      targetId: entry.id,
      teamId: auth.activeTeamId,
      metadata: { scope: payload.scope, labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({ entry });
  });

  app.get('/v1/knowledge/mine', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entries = await knowledgeRepo.listByFilter({ ownerUserId });

    // toKnowledgeEntry needs StoreData for user handle resolution
    const data = await app.skillShareer.store.snapshot();
    const items = entries.map((entry) => toKnowledgeEntry(data, entry));

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

    // toKnowledgeEntry needs StoreData for user handle resolution
    const data = await app.skillShareer.store.snapshot();
    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(data, entry),
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

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const existingEntries = (await knowledgeRepo.listByFilter({})).filter(
      (entry) => entry.id !== entryId,
    );
    const preReview = await runPreReview({
      existingEntries,
      submission: {
        scope: 'project',
        labels: payload.labels,
        shortcut: payload.shortcut,
        detail: payload.detail,
      },
      chatProvider: app.skillShareer.ai.chat,
      authorBoundary: payload.boundary ?? null,
    });

    // store.transact() needed: resubmitKnowledgeEntry uses store.nextId() for sub-record IDs
    const updatedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.ownerUserId !== ownerUserId) {
        throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this entry');
      }

      if (!['rejected', 'agent-rejected'].includes(entry.lifecycleState)) {
        throw new AppError(400, 'invalid_state', 'Only rejected entries may be resubmitted');
      }

      const submittedAt = nowIso();
      // Use payload boundary if provided, otherwise use extracted boundary from pre-review
      const boundary = payload.boundary ?? preReview.boundary ?? null;
      resubmitKnowledgeEntry({
        store: app.skillShareer.store,
        data,
        entry,
        ownerUserId,
        payload,
        submittedAt,
        preReview,
        boundary,
      });

      return toKnowledgeEntry(data, entry);
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'resubmit', labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({ entry: updatedEntry });
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

    const updatedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.teamId) {
        requireTeamAccess(auth, entry.teamId);
      }

      requireHigherLevel(auth, entry.requiredLevel, payload.requiredLevel ?? entry.requiredLevel);

      const modifierId =
        auth.user?.id ??
        (() => {
          throw new AppError(
            403,
            'user_required',
            'System admin cannot author knowledge revisions',
          );
        })();

      const submittedAt = nowIso();

      // Capture previous state before update
      previousState = entry.lifecycleState;

      updateKnowledgeEntry({
        store: app.skillShareer.store,
        data,
        entry,
        modifierUserId: modifierId,
        payload: {
          labels: payload.labels ?? entry.labels,
          shortcut: payload.shortcut ?? entry.shortcut,
          detail: payload.detail ?? entry.detail,
          requiredLevel: payload.requiredLevel ?? entry.requiredLevel,
        },
        updatedAt: submittedAt,
      });

      // Capture new state after update (should be same as previous for update)
      nextState = entry.lifecycleState;

      return toKnowledgeEntry(data, entry);
    });

    // Post-commit: emit event for index refresh on approved entries
    // Only refresh indexes for approved entries (IDX-05, T-11-04)
    if (previousState && nextState && nextState === 'approved') {
      const eventName = findTransitionEvent(previousState, nextState) ?? 'knowledge.approved';
      await app.skillShareer.eventBus.emitDomainEventAsync({
        name: eventName,
        entryId,
        previousState,
        nextState,
        actorId: auth.actorId,
        reason: 'updated',
        timestamp: nowIso(),
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

    // store.transact() needed: supersedeEntry uses store.nextId() for lifecycle event IDs
    const { entry: supersededEntry, data: txData } = await app.skillShareer.store.transact(
      (data) => {
        const result = supersedeEntry({
          store: app.skillShareer.store,
          data,
          entryId,
          replacementId: body.replacementId!,
          actorId: auth.actorId,
        });
        return { entry: result, data };
      },
    );

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'supersede',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { replacementId: body.replacementId },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(txData, supersededEntry),
    });
  });
};
