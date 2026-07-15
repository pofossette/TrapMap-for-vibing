import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
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

export const trapRoutes: FastifyPluginAsync = async (app) => {
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

    const result = await app.skillShareer.knowledgeOwner.createTrap({
      actorId: ownerUserId,
      content: payload.detail,
      title: payload.shortcut,
      labels: payload.labels,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      scope: payload.scope,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
    });
    const entry = await app.skillShareer.knowledgeOwner.getById(result.trapId);
    if (!entry) throw new AppError(404, 'trap_not_found', 'Trap entry not found after creation');
    const normalized = normalizeKnowledgeOwnerEntry(entry);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-submit',
      targetId: normalized.id,
      teamId: auth.activeTeamId,
      metadata: { scope: payload.scope, labels: payload.labels },
    });
    return knowledgeEntryResponseSchema.parse({ entry: normalized });
  });

  app.get('/v1/traps', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const entries = await app.skillShareer.knowledgeOwner.listByFilter({
      ownerUserId: requireRealUser(auth.user?.id),
    });
    return knowledgeHistoryResponseSchema.parse({
      items: entries.map((entry) => normalizeKnowledgeOwnerEntry(entry)),
    });
  });

  app.get('/v1/traps/:trapId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const trapId = (request.params as { trapId: string }).trapId;
    const entry = await app.skillShareer.knowledgeOwner.getById(trapId);
    if (!entry) throw new AppError(404, 'trap_not_found', 'Trap entry not found');
    const normalized = normalizeKnowledgeOwnerEntry(entry);
    const isOwner = auth.user?.id === ownerId(normalized);
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > normalized.requiredLevel;
    if (!isOwner && !canReview)
      throw new AppError(403, 'forbidden', 'You do not have access to this trap entry');
    return knowledgeEntryResponseSchema.parse({ entry: normalized });
  });

  app.post('/v1/traps/:trapId/resubmit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);
    const trapId = (request.params as { trapId: string }).trapId;
    const payload = knowledgeResubmissionSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId: trapId,
    });
    await app.skillShareer.knowledgeOwner.resubmit(
      trapId,
      {
        detail: payload.detail,
        shortcut: payload.shortcut,
        labels: payload.labels,
        boundary: payload.boundary,
      },
      ownerUserId,
    );
    const entry = await app.skillShareer.knowledgeOwner.getById(trapId);
    if (!entry) throw new AppError(404, 'trap_not_found', 'Trap entry not found after resubmit');
    const normalized = normalizeKnowledgeOwnerEntry(entry);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-resubmit',
      targetId: trapId,
      teamId: auth.activeTeamId,
      metadata: { labels: payload.labels },
    });
    return knowledgeEntryResponseSchema.parse({ entry: normalized });
  });

  app.post('/v1/traps/:trapId/supersede', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    const trapId = (request.params as { trapId: string }).trapId;
    const body = (request.body as { replacementId?: string }) ?? {};
    if (!body.replacementId)
      throw new AppError(400, 'replacement_required', 'replacementId is required');
    await app.skillShareer.knowledgeOwner.supersede(trapId, body.replacementId, auth.actorId);
    const entry = await app.skillShareer.knowledgeOwner.getById(trapId);
    if (!entry) throw new AppError(404, 'trap_not_found', 'Trap entry not found after supersede');
    const normalized = normalizeKnowledgeOwnerEntry(entry);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-supersede',
      targetId: trapId,
      teamId: auth.activeTeamId,
      metadata: { replacementId: body.replacementId },
    });
    return knowledgeEntryResponseSchema.parse({ entry: normalized });
  });
};
