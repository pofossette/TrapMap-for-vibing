import {
  knowledgeEntryResponseSchema,
  knowledgeHistoryResponseSchema,
  knowledgeResubmissionSchema,
  knowledgeSubmissionSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromActorLookup } from '@trapmap/server/lib/actors/lookup.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import { createKnowledgeApplicationService } from '@trapmap/server/lib/knowledge/application-service.js';
import { emitLifecycleTransition } from '@trapmap/server/lib/lifecycle/index.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
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

export const trapRoutes: FastifyPluginAsync = async (app) => {
  function getKnowledgeService() {
    return createKnowledgeApplicationService({
      knowledgeRepo: app.skillShareer.repos.knowledge,
      chatProvider: app.skillShareer.ai.chat,
    });
  }

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

    const { entry } = await getKnowledgeService().submit({
      kind: 'trap',
      ownerUserId,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      payload,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
      boundary: payload.boundary,
    });

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      [entry],
    );

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-submit',
      targetId: entry.id,
      teamId: auth.activeTeamId,
      metadata: { scope: payload.scope, labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });

  // GET /v1/traps - List own traps
  app.get('/v1/traps', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const ownerUserId = requireRealUser(auth.user?.id);

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entries = await knowledgeRepo.listByFilter({ ownerUserId });
    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      entries,
    );
    const items = entries.map((entry) => toKnowledgeEntry(lookup, entry));

    return knowledgeHistoryResponseSchema.parse({ items });
  });

  // GET /v1/traps/:trapId - Get trap details
  app.get('/v1/traps/:trapId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    const trapId = (request.params as { trapId: string }).trapId;
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entry = await knowledgeRepo.getById(trapId);

    if (!entry) {
      throw new AppError(404, 'trap_not_found', 'Trap entry not found');
    }

    const isOwner = auth.user?.id === entry.ownerUserId;
    const canReview =
      auth.subjectType === 'system-admin' || auth.securityLevel > entry.requiredLevel;

    if (!isOwner && !canReview) {
      throw new AppError(403, 'forbidden', 'You do not have access to this trap entry');
    }

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      [entry],
    );
    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
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

    const { entry } = await getKnowledgeService().resubmit({
      kind: 'trap',
      entryId: trapId,
      ownerUserId,
      payload,
    });

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      [entry],
    );

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'trap-resubmit',
      targetId: trapId,
      teamId: auth.activeTeamId,
      metadata: { labels: payload.labels },
    });

    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });

  // POST /v1/traps/:trapId/supersede - Supersede a trap with a replacement
  app.post('/v1/traps/:trapId/supersede', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const trapId = (request.params as { trapId: string }).trapId;
    const body = (request.body as { replacementId?: string }) ?? {};
    if (!body.replacementId || typeof body.replacementId !== 'string') {
      throw new AppError(400, 'replacement_required', 'replacementId is required');
    }

    const entry = (
      await getKnowledgeService().supersede({
        kind: 'trap',
        entryId: trapId,
        replacementId: body.replacementId,
        actorId: auth.actorId,
      })
    ).entry;

    await emitLifecycleTransition({
      store: app.skillShareer.store,
      eventBus: app.skillShareer.eventBus,
      ...(app.skillShareer.asyncTransport
        ? {
            asyncTransport: {
              events: app.skillShareer.asyncTransport.events,
            },
          }
        : {}),
      aggregateType: 'knowledge',
      aggregateId: trapId,
      previousState: 'approved',
      nextState: 'deactivated',
      actorId: auth.actorId,
      reason: 'superseded',
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

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      [entry],
    );
    return knowledgeEntryResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, entry),
    });
  });
};
