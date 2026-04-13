import {
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
} from '@skill-shareer/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { toKnowledgeEntry, toKnowledgeListItem } from '../lib/knowledge.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = knowledgeListRequestSchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    let entries = data.knowledgeEntries;

    // Filter based on user permissions
    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter((entry) => {
        // User can see entries where their level > entry.requiredLevel
        if (auth.securityLevel > entry.requiredLevel) {
          return true;
        }
        // Or entries in their active team
        if (entry.teamId && auth.activeTeamId === entry.teamId) {
          return true;
        }
        return false;
      });
    }

    // Apply optional filters
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

    // Sort by updatedAt descending
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Apply limit
    const limit = query.limit;
    const total = entries.length;
    entries = entries.slice(0, limit);

    const items = entries.map((entry) => toKnowledgeListItem(entry));

    return knowledgeListResponseSchema.parse({
      items,
      nextCursor: null,
      total,
    });
  });

  app.post('/v1/operations/knowledge/:entryId/deactivate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeDeactivateRequestSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });

    const updatedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.teamId) {
        requireTeamAccess(auth, entry.teamId);
      }

      requireHigherLevel(auth, entry.requiredLevel);

      const deactivatedAt = nowIso();

      // Set lifecycle state
      entry.lifecycleState = 'deactivated';

      // Add lifecycle event
      entry.lifecycleHistory.push({
        id: app.skillShareer.store.nextId(data, 'knowledge_event'),
        type: 'deactivated',
        createdAt: deactivatedAt,
        actorUserId: auth.user?.id ?? null,
        submissionId: entry.latestSubmissionId,
        revision: entry.latestRevision.revision,
        state: 'deactivated',
        note: payload.reason,
      });

      entry.updatedAt = deactivatedAt;

      return toKnowledgeEntry(data, entry);
    });

    return knowledgeDeactivateResponseSchema.parse({ entry: updatedEntry });
  });
};