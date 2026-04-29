import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
  knowledgeUpdateSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { runKnowledgeIndexEvent } from '../lib/indexing/events.js';
import {
  createKnowledgeEntryRecord,
  createKnowledgeRevision,
  resubmitKnowledgeEntry,
  toKnowledgeEntry,
  updateKnowledgeEntry,
} from '../lib/knowledge.js';
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

    const preReview = await runPreReview({
      existingEntries: (await app.skillShareer.store.snapshot()).knowledgeEntries,
      submission: payload,
    });

    const createdAt = nowIso();

    const entry = await app.skillShareer.store.transact((data) => {
      const record = createKnowledgeEntryRecord({
        store: app.skillShareer.store,
        data,
        ownerUserId,
        teamId: payload.scope === 'project' ? auth.activeTeamId : null,
        payload,
        requiredLevel: payload.requiredLevel ?? auth.securityLevel,
        createdAt,
        preReview,
      });

      data.knowledgeEntries.push(record);

      return toKnowledgeEntry(data, record);
    });

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

    const data = await app.skillShareer.store.snapshot();
    const items = data.knowledgeEntries
      .filter((entry) => entry.ownerUserId === ownerUserId)
      .map((entry) => toKnowledgeEntry(data, entry));

    return knowledgeHistoryResponseSchema.parse({ items });
  });

  app.get('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const entryId = (request.params as { entryId: string }).entryId;
    const data = await app.skillShareer.store.snapshot();
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    const isOwner = auth.user?.id === entry.ownerUserId;
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > entry.requiredLevel;

    if (!isOwner && !canReview) {
      throw new AppError(403, 'forbidden', 'You do not have access to this knowledge entry');
    }

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

    const existingEntries = (await app.skillShareer.store.snapshot()).knowledgeEntries.filter(
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
    });

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
      resubmitKnowledgeEntry({
        store: app.skillShareer.store,
        data,
        entry,
        ownerUserId,
        payload,
        submittedAt,
        preReview,
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

    // Trigger indexing AFTER the transaction commits (post-commit pattern)
    // Only refresh indexes for approved entries (IDX-05, T-11-04)
    if (previousState && nextState && nextState === 'approved') {
      try {
        await runKnowledgeIndexEvent({
          services: {
            store: app.skillShareer.store,
            data: await app.skillShareer.store.snapshot(),
          },
          entryId,
          previousState,
          nextState,
          reason: 'updated',
          adapters: app.skillShareer.indexAdapters,
        });
      } catch (indexingError) {
        // Log but don't fail the request - domain state is already committed
        app.log.error({ indexingError, entryId }, 'Post-commit indexing failed after update');
        // Optionally: schedule retry or mark entry for reconciliation
      }
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
};
