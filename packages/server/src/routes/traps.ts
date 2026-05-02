import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { supersedeEntry } from '../lib/decay/supersede.js';
import { AppError } from '../lib/errors.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '../lib/governance/index.js';
import { runKnowledgeIndexEvent } from '../lib/indexing/events.js';
import {
  createKnowledgeEntryRecord,
  createKnowledgeRevision,
  resubmitKnowledgeEntry,
  toKnowledgeEntry,
} from '../lib/knowledge.js';
import { runPreReview } from '../lib/pre-review.js';
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

export const trapRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/traps - Submit new trap
  app.post('/v1/traps', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');

    const payload = knowledgeSubmissionSchema.parse(request.body);
    const ownerUserId = requireRealUser(auth.user?.id);

    if (payload.scope === 'project' && !auth.activeTeamId) {
      throw new AppError(
        400,
        'active_team_required',
        'Project-scoped trap requires an active team',
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

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-submit',
      targetId: entry.id,
      teamId: auth.activeTeamId,
      metadata: { scope: payload.scope, labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({ entry });
  });

  // GET /v1/traps - List own traps
  app.get('/v1/traps', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);

    const data = await app.skillShareer.store.snapshot();
    const items = data.knowledgeEntries
      .filter((entry) => entry.ownerUserId === ownerUserId)
      .map((entry) => toKnowledgeEntry(data, entry));

    return knowledgeHistoryResponseSchema.parse({ items });
  });

  // GET /v1/traps/:trapId - Get trap details
  app.get('/v1/traps/:trapId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const trapId = (request.params as { trapId: string }).trapId;
    const data = await app.skillShareer.store.snapshot();
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === trapId);

    if (!entry) {
      throw new AppError(404, 'trap_not_found', 'Trap entry not found');
    }

    const isOwner = auth.user?.id === entry.ownerUserId;
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > entry.requiredLevel;

    if (!isOwner && !canReview) {
      throw new AppError(403, 'forbidden', 'You do not have access to this trap entry');
    }

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(data, entry),
    });
  });

  // POST /v1/traps/:trapId/resubmit - Resubmit rejected trap
  app.post('/v1/traps/:trapId/resubmit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);
    const trapId = (request.params as { trapId: string }).trapId;
    const payload = knowledgeResubmissionSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId: trapId,
    });

    const existingEntries = (await app.skillShareer.store.snapshot()).knowledgeEntries.filter(
      (entry) => entry.id !== trapId,
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
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === trapId);

      if (!entry) {
        throw new AppError(404, 'trap_not_found', 'Trap entry not found');
      }

      if (entry.ownerUserId !== ownerUserId) {
        throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this trap');
      }

      if (!['rejected', 'agent-rejected'].includes(entry.lifecycleState)) {
        throw new AppError(400, 'invalid_state', 'Only rejected traps may be resubmitted');
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

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-resubmit',
      targetId: trapId,
      teamId: auth.activeTeamId,
      metadata: { labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({ entry: updatedEntry });
  });

  // POST /v1/traps/:trapId/supersede - Supersede a trap with a replacement
  app.post('/v1/traps/:trapId/supersede', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const trapId = (request.params as { trapId: string }).trapId;
    const body = request.body as { replacementId?: string } ?? {};
    if (!body.replacementId || typeof body.replacementId !== 'string') {
      throw new AppError(400, 'replacement_required', 'replacementId is required');
    }

    const supersededEntry = await app.skillShareer.store.transact((data) => {
      return supersedeEntry({
        store: app.skillShareer.store,
        data,
        entryId: trapId,
        replacementId: body.replacementId!,
        actorId: auth.actorId,
      });
    });

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-supersede',
      targetId: trapId,
      teamId: auth.activeTeamId,
      metadata: { replacementId: body.replacementId },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(await app.skillShareer.store.snapshot(), supersededEntry),
    });
  });
};
