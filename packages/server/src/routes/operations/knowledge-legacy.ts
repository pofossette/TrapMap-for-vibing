import {
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromActorLookup } from '@trapmap/server/lib/actors/lookup.js';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { toKnowledgeEntry, toKnowledgeListItem } from '@trapmap/server/lib/knowledge.js';
import { upsertKnowledgeEntryShadow } from '@trapmap/server/lib/knowledge/shadow-sync.js';
import {
  emitLifecycleTransition,
  transitionLifecycleState,
} from '@trapmap/server/lib/lifecycle/index.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';

export const knowledgeLegacyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = knowledgeListRequestSchema.parse(request.query as Record<string, unknown>);
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    let entries = await knowledgeRepo.listByFilter({});

    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter((entry) => {
        if (auth.securityLevel > entry.requiredLevel) return true;
        if (entry.teamId && auth.activeTeamId === entry.teamId) return true;
        return false;
      });
    }

    if (query.scope !== undefined) {
      entries = entries.filter((entry) => entry.scope === query.scope);
    }

    if (query.lifecycleState !== undefined && query.lifecycleState.length > 0) {
      const states = new Set(query.lifecycleState);
      entries = entries.filter((entry) => states.has(entry.lifecycleState));
    }

    if (query.requiredLevelMax !== undefined) {
      entries = entries.filter((entry) => entry.requiredLevel <= query.requiredLevelMax!);
    }

    if (query.ownerUserId !== undefined) {
      entries = entries.filter((entry) => entry.ownerUserId === query.ownerUserId);
    }

    if (query.evidenceLevel && query.evidenceLevel.length > 0) {
      entries = entries.filter(
        (entry) =>
          entry.evidenceMeta && query.evidenceLevel!.includes(entry.evidenceMeta.evidenceLevel),
      );
    }

    if (query.sourceType && query.sourceType.length > 0) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && query.sourceType!.includes(entry.evidenceMeta.sourceType),
      );
    }

    if (query.verifiedBefore) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && entry.evidenceMeta.verifiedAt < query.verifiedBefore!,
      );
    }

    if (query.verifiedAfter) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && entry.evidenceMeta.verifiedAt > query.verifiedAfter!,
      );
    }

    if (query.missingEvidence) {
      entries = entries.filter((entry) => !entry.evidenceMeta);
    }

    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const total = entries.length;
    const items = entries.slice(0, query.limit).map((entry) => toKnowledgeListItem(entry));

    return knowledgeListResponseSchema.parse({ items, nextCursor: null, total });
  });

  app.post('/v1/operations/knowledge/:entryId/deactivate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeDeactivateRequestSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });

    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const entry = await knowledgeRepo.getById(entryId);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    if (entry.teamId) {
      requireTeamAccess(auth, entry.teamId);
    }

    requireHigherLevel(auth, entry.requiredLevel);

    const deactivatedAt = nowIso();
    const actorId = auth.user?.id ?? auth.actorId;
    previousState = entry.lifecycleState;
    transitionLifecycleState(entry, 'deactivated', 'knowledge deactivate');
    nextState = 'deactivated';

    await knowledgeRepo.updateLifecycle(entryId, 'deactivated', {
      actorId,
      note: payload.reason,
    });

    await app.skillShareer.store.transact((data) => {
      entry.lifecycleHistory.push({
        id: app.skillShareer.store.nextId(data, 'knowledge_event'),
        type: 'deactivated',
        createdAt: deactivatedAt,
        actorUserId: actorId,
        submissionId: entry.latestSubmissionId,
        revision: entry.latestRevision.revision,
        state: 'deactivated',
        note: payload.reason,
      });
      entry.updatedAt = deactivatedAt;
      upsertKnowledgeEntryShadow(data, entry);

      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: entry.teamId,
        actor: auth,
        action: 'knowledge-deactivated',
        entityId: entry.id,
        payload: { reason: payload.reason, previousState },
      });
      data.auditEvents.push(auditEvent);
    });

    if (previousState && nextState) {
      await emitLifecycleTransition({
        store: app.skillShareer.store,
        eventBus: app.skillShareer.eventBus,
        ...(app.skillShareer.asyncTransport
          ? { asyncTransport: app.skillShareer.asyncTransport }
          : {}),
        aggregateType: 'knowledge',
        aggregateId: entryId,
        previousState,
        nextState,
        actorId: auth.actorId,
        reason: 'deactivated',
      });
    }

    const updatedEntry = await knowledgeRepo.getById(entryId);
    if (!updatedEntry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found after update');
    }

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      [updatedEntry],
    );
    return knowledgeDeactivateResponseSchema.parse({
      entry: toKnowledgeEntry(lookup, updatedEntry),
    });
  });
};
