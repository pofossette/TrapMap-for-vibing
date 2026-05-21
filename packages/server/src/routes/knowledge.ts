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
  createKnowledgeRevision,
  toKnowledgeEntry,
} from '../lib/knowledge.js';
import { findTransitionEvent } from '../lib/lifecycle/transitions.js';
import { runPreReview } from '../lib/pre-review.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import type { KnowledgeRecord } from '../lib/store.js';
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

    const entryId = await knowledgeRepo.nextId();

    const record = createKnowledgeEntryRecord({
      ownerUserId,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      payload,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
      createdAt,
      preReview,
      boundary,
      entryId,
    });

    await knowledgeRepo.insert(record);

    // Serialize using store data for user handle resolution
    // Round 2: toKnowledgeEntry accepts UserLookupContext,
    // StoreData is structurally compatible
    const data = await app.skillShareer.store.snapshot();
    const entry = toKnowledgeEntry(data, record);

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

    // Fetch entry directly from repo, not store snapshot
    const existingEntry = await knowledgeRepo.getById(entryId);
    if (!existingEntry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (existingEntry.ownerUserId !== ownerUserId) {
      throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this entry');
    }

    if (!['rejected', 'agent-rejected'].includes(existingEntry.lifecycleState)) {
      throw new AppError(400, 'invalid_state', 'Only rejected entries may be resubmitted');
    }

    const submittedAt = nowIso();
    // Use payload boundary if provided, otherwise use extracted boundary from pre-review
    const boundary = payload.boundary ?? preReview.boundary ?? null;

    // Build revision and compute state changes (avoid in-place mutation)
    const previousSubmissionId = existingEntry.latestSubmissionId;
    const revisionNumber = existingEntry.history.length + 1;
    const revision = createKnowledgeRevision(
      ownerUserId,
      {
        detail: payload.detail,
        labels: payload.labels,
        shortcut: payload.shortcut,
      },
      revisionNumber,
      submittedAt,
    );

    const newLifecycleState = preReview.status;

    // Persist all changes via repository (Round 2: each method handles its own persistence)
    await knowledgeRepo.updateGovernance(entryId, {
      labels: revision.labels,
      requiredLevel: existingEntry.requiredLevel,
    });
    await knowledgeRepo.appendRevision(entryId, revision);
    await knowledgeRepo.updateLifecycle(entryId, newLifecycleState, {
      actorId: ownerUserId,
      note: previousSubmissionId ? `Resubmission of ${previousSubmissionId}` : 'resubmit',
    });

    // Build response entry (snapshot of changes)
    const entryForResponse: KnowledgeRecord = {
      ...existingEntry,
      labels: revision.labels,
      shortcut: revision.shortcut,
      detail: revision.detail,
      lifecycleState: newLifecycleState,
      latestRevision: revision,
      history: [...existingEntry.history, revision],
      boundary: boundary ?? existingEntry.boundary,
      updatedAt: submittedAt,
    };

    // Serialize using store data for user handle resolution
    const data = await app.skillShareer.store.snapshot();
    const updatedEntry = toKnowledgeEntry(data, entryForResponse);

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
      updatedAt: submittedAt,
    };

    // Serialize using store data for user handle resolution
    const data = await app.skillShareer.store.snapshot();
    const updatedEntry = toKnowledgeEntry(data, entryForResponse);

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

    // supersedeEntry still requires store.transact() because it uses
    // store.nextId() for sub-record IDs and mutates StoreData directly.
    // Round 3 (knowledge domain restructure) will address this.
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
