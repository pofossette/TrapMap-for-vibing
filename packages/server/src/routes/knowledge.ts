import {
  knowledgeEntryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeUpdateSchema,
  reviewDecisionRequestSchema,
  reviewerDecisionOutputSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';
import { normalizeKnowledgeOwnerEntry, ownerId } from './knowledge-owner-response.js';
import {
  listOwnedKnowledgeHistory,
  requireRealUser,
  resolveOwnerSubmission,
} from './knowledge-owner-route-helpers.js';

async function loadEntry(
  app: Parameters<FastifyPluginAsync>[0],
  entryId: string,
): Promise<ReturnType<typeof normalizeKnowledgeOwnerEntry>> {
  const entry = await app.skillShareer.knowledgeOwner.getById(entryId);
  if (!entry) throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  return normalizeKnowledgeOwnerEntry(entry);
}

function logKnowledgeEdit(
  app: Parameters<FastifyPluginAsync>[0],
  auth: { actorId: string; handle: string; activeTeamId: string | null },
  entryId: string,
  metadata: { endpoint: 'resubmit' | 'update'; labels?: string[] },
): void {
  void logUserOperation(app.skillShareer.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'edit',
    targetId: entryId,
    teamId: auth.activeTeamId,
    metadata,
  });
}

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/knowledge', async (request) => {
    const { auth, payload, ownerUserId } = await resolveOwnerSubmission(app, request, 'knowledge');

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
    return listOwnedKnowledgeHistory(app, request);
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
    logKnowledgeEdit(app, auth, entryId, { endpoint: 'resubmit', labels: payload.labels });
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
    logKnowledgeEdit(app, auth, entryId, { endpoint: 'update', labels: payload.labels });
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
