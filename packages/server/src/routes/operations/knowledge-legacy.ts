import {
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { runKnowledgeIndexEvent } from '../../lib/indexing/events.js';
import { toKnowledgeEntry, toKnowledgeListItem } from '../../lib/knowledge.js';
import { transitionLifecycleState } from '../../lib/lifecycle/state-machine.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';
import { nowIso } from '../../lib/store.js';

export const knowledgeLegacyRoutes: FastifyPluginAsync = async (app) => {
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
      const maxLevel = query.requiredLevelMax;
      entries = entries.filter((entry) => entry.requiredLevel <= maxLevel);
    }

    if (query.ownerUserId !== undefined) {
      entries = entries.filter((entry) => entry.ownerUserId === query.ownerUserId);
    }

    // Apply evidence-based filters
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

      requireHigherLevel(auth, entry.requiredLevel);

      const deactivatedAt = nowIso();

      // Capture previous state before deactivation
      previousState = entry.lifecycleState;

      // Set lifecycle state
      transitionLifecycleState(entry, 'deactivated', 'knowledge deactivate');
      nextState = 'deactivated';

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

      // Record audit event
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

      return toKnowledgeEntry(data, entry);
    });

    // Trigger indexing AFTER the transaction commits (post-commit pattern)
    // Deactivation always removes index state (IDX-06, T-11-06)
    if (previousState && nextState && previousState !== nextState) {
      await runKnowledgeIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
        },
        entryId,
        previousState,
        nextState,
        reason: 'deactivated',
        adapters: app.skillShareer.indexAdapters,
      });
    }

    return knowledgeDeactivateResponseSchema.parse({ entry: updatedEntry });
  });
};
