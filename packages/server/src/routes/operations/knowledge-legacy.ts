import {
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListItemSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';
import { normalizeKnowledgeOwnerEntry } from '../knowledge-owner-response.js';

export const knowledgeLegacyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');
    const query = knowledgeListRequestSchema.parse(request.query as Record<string, unknown>);
    let entries = (
      await app.skillShareer.knowledgeOwner.listByFilter({
        lifecycleState: query.lifecycleState?.length === 1 ? query.lifecycleState[0] : undefined,
        ownerUserId: query.ownerUserId,
      })
    ).map((entry) => normalizeKnowledgeOwnerEntry(entry));

    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter(
        (entry) =>
          auth.securityLevel > entry.requiredLevel ||
          (entry.teamId && auth.activeTeamId === entry.teamId),
      );
    }
    if (query.scope !== undefined) entries = entries.filter((entry) => entry.scope === query.scope);
    if (query.lifecycleState?.length) {
      entries = entries.filter((entry) => query.lifecycleState!.includes(entry.lifecycleState));
    }
    if (query.requiredLevelMax !== undefined) {
      entries = entries.filter((entry) => entry.requiredLevel <= query.requiredLevelMax!);
    }
    if (query.evidenceLevel?.length) {
      entries = entries.filter(
        (entry) =>
          entry.evidenceMeta && query.evidenceLevel!.includes(entry.evidenceMeta.evidenceLevel),
      );
    }
    if (query.sourceType?.length) {
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
    if (query.missingEvidence) entries = entries.filter((entry) => !entry.evidenceMeta);

    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const items = entries
      .slice(0, query.limit)
      .map((entry) => knowledgeListItemSchema.parse(entry));
    return knowledgeListResponseSchema.parse({ items, nextCursor: null, total: entries.length });
  });

  app.post('/v1/operations/knowledge/:entryId/deactivate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');
    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeDeactivateRequestSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });
    const existing = await app.skillShareer.knowledgeOwner.getById(entryId);
    if (!existing) throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    const entry = normalizeKnowledgeOwnerEntry(existing);
    if (entry.teamId) requireTeamAccess(auth, entry.teamId);
    requireHigherLevel(auth, entry.requiredLevel);
    await app.skillShareer.knowledgeOwner.applyMaintenanceDecision({
      entryId,
      actorId: auth.actorId,
      action: 'deactivate',
      note: payload.reason,
    });
    const updated = await app.skillShareer.knowledgeOwner.getById(entryId);
    if (!updated)
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found after update');
    const normalized = normalizeKnowledgeOwnerEntry(updated);
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: normalized.updatedAt,
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'knowledge-deactivated',
      targetId: entryId,
      teamId: auth.activeTeamId,
      metadata: { reason: payload.reason },
    });
    return knowledgeDeactivateResponseSchema.parse({ entry: normalized });
  });
};
