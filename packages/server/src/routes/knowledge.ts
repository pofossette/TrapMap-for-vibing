import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
  knowledgeUpdateSchema,
  reviewDecisionRequestSchema,
  reviewerDecisionOutputSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';
import { normalizeKnowledgeOwnerEntry, ownerId } from './knowledge-owner-response.js';

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

async function loadEntry(
  app: Parameters<FastifyPluginAsync>[0],
  entryId: string,
): Promise<ReturnType<typeof normalizeKnowledgeOwnerEntry>> {
  const entry = await app.skillShareer.knowledgeOwner.getById(entryId);
  if (!entry) throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  return normalizeKnowledgeOwnerEntry(entry);
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

    const result = await app.skillShareer.knowledgeOwner.submit({
      actorId: ownerUserId,
      content: payload.detail,
      title: payload.shortcut,
      labels: payload.labels,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      scope: payload.scope,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
    });
    const entry = await loadEntry(app, result.entryId);

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

  app.post('/v1/knowledge/review', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');
    const payload = reviewDecisionRequestSchema.parse(request.body);
    const decision =
      payload.decision === 'approve' ? 'approveReviewDecision' : 'rejectReviewDecision';
    await app.skillShareer.knowledgeOwner[decision]({
      entryId: payload.entryId,
      actorId: auth.actorId,
      note: payload.notes,
      evidence: payload.evidence,
    });
    const entry = await loadEntry(app, payload.entryId);
    const latestDecision = entry.reviewHistory.at(-1) ?? {
      decidedAt: nowIso(),
      decidedBy: { id: auth.actorId, handle: auth.handle, securityLevel: auth.securityLevel },
      decision: payload.decision,
      notes: payload.notes,
    };
    return reviewerDecisionOutputSchema.parse({
      entry,
      submission: entry.latestSubmission,
      decision: latestDecision,
    });
  });

  app.get('/v1/knowledge/mine', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const entries = await app.skillShareer.knowledgeOwner.listByFilter({
      ownerUserId: requireRealUser(auth.user?.id),
    });
    return knowledgeHistoryResponseSchema.parse({
      items: entries.map((entry) => normalizeKnowledgeOwnerEntry(entry)),
    });
  });

  app.get('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const entry = await loadEntry(app, (request.params as { entryId: string }).entryId);
    const isOwner = auth.user?.id === ownerId(entry);
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > entry.requiredLevel;
    if (!isOwner && !canReview)
      throw new AppError(403, 'forbidden', 'You do not have access to this knowledge entry');
    return knowledgeEntryResponseSchema.parse({ entry });
  });

  app.post('/v1/knowledge/:entryId/resubmit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);
    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeResubmissionSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });
    await app.skillShareer.knowledgeOwner.resubmit(
      entryId,
      {
        detail: payload.detail,
        shortcut: payload.shortcut,
        labels: payload.labels,
        boundary: payload.boundary,
      },
      ownerUserId,
    );
    const entry = await loadEntry(app, entryId);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'resubmit', labels: payload.labels },
    });
    return knowledgeEntryResponseSchema.parse({ entry });
  });

  app.patch('/v1/knowledge/:entryId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeUpdateSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });
    const existingEntry = await loadEntry(app, entryId);
    if (existingEntry.teamId) requireTeamAccess(auth, existingEntry.teamId);
    requireHigherLevel(
      auth,
      existingEntry.requiredLevel,
      payload.requiredLevel ?? existingEntry.requiredLevel,
    );
    const actorId = requireRealUser(auth.user?.id);
    await app.skillShareer.knowledgeOwner.updateEntry(
      entryId,
      {
        ...(payload.labels === undefined ? {} : { labels: payload.labels }),
        ...(payload.shortcut === undefined ? {} : { shortcut: payload.shortcut }),
        ...(payload.detail === undefined ? {} : { detail: payload.detail }),
        ...(payload.requiredLevel === undefined ? {} : { requiredLevel: payload.requiredLevel }),
      },
      actorId,
    );
    const entry = await loadEntry(app, entryId);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'update', labels: payload.labels },
    });
    return knowledgeEntryResponseSchema.parse({ entry });
  });

  app.post('/v1/knowledge/:entryId/supersede', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    const entryId = (request.params as { entryId: string }).entryId;
    const body = (request.body as { replacementId?: string }) ?? {};
    if (!body.replacementId)
      throw new AppError(400, 'replacement_required', 'replacementId is required');
    await app.skillShareer.knowledgeOwner.supersede(entryId, body.replacementId, auth.actorId);
    const entry = await loadEntry(app, entryId);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'supersede',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { replacementId: body.replacementId },
    });
    return knowledgeEntryResponseSchema.parse({ entry });
  });
};
