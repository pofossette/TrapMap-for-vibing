import {
  auditListResponseSchema,
  auditQuerySchema,
  exportBundleSchema,
  exportRequestSchema,
  importRequestSchema,
  importResponseSchema,
  importResultItemSchema,
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
} from '@skill-shareer/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent, queryAuditEvents, toAuditEvent } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { createImportedEntry, detectDuplicates, parseClaudeSkill } from '../lib/import-export.js';
import { toKnowledgeEntry, toKnowledgeListItem } from '../lib/knowledge.js';
import { runPreReview } from '../lib/pre-review.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { runKnowledgeIndexEvent } from '../lib/indexing/events.js';

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    const result = queryAuditEvents({
      data,
      query: {
        ...(query.action !== undefined && { action: query.action }),
        ...(query.actorId !== undefined && { actorId: query.actorId }),
        ...(query.entityId !== undefined && { entityId: query.entityId }),
        ...(query.teamId !== undefined && { teamId: query.teamId }),
        ...(query.from !== undefined && { from: query.from }),
        ...(query.to !== undefined && { to: query.to }),
        limit: query.limit,
      },
      auth,
    });

    const items = result.items.map((record) => toAuditEvent(record, data));

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });

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

    // Capture transition context for post-commit indexing
    let previousState: string | undefined;
    let nextState: string | undefined;

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
      entry.lifecycleState = 'deactivated';
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
        previousState: previousState as any,
        nextState: nextState as any,
        reason: 'deactivated',
        adapters: app.skillShareer.indexAdapters,
      });
    }

    return knowledgeDeactivateResponseSchema.parse({ entry: updatedEntry });
  });

  app.post('/v1/operations/export', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = exportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    const data = await app.skillShareer.store.snapshot();

    let entries = data.knowledgeEntries;

    // Filter by teamId if specified
    if (body.teamId !== undefined) {
      if (body.teamId === null) {
        // Export global entries only
        entries = entries.filter((entry) => entry.teamId === null);
      } else {
        // Export specific team entries
        entries = entries.filter((entry) => entry.teamId === body.teamId);
      }
    }

    // Non-system-admin can only export entries where their level >= entry.requiredLevel
    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter((entry) => auth.securityLevel >= entry.requiredLevel);
    }

    const items = entries.map((entry) => toKnowledgeEntry(data, entry));

    const actorRef = {
      id: auth.actorId,
      handle: auth.handle,
      securityLevel: auth.securityLevel,
    };

    const exportedAt = nowIso();
    const entryCount = items.length;
    const exportTeamId = body.teamId;

    // Record audit event
    await app.skillShareer.store.transact((data) => {
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: exportTeamId ?? null,
        actor: auth,
        action: 'knowledge-exported',
        entityId: entryCount > 0 ? (items[0]?.id ?? 'batch') : 'batch',
        payload: { entryCount, teamId: exportTeamId, includeHistory: body.includeHistory },
      });
      data.auditEvents.push(auditEvent);
    });

    return exportBundleSchema.parse({
      exportedAt,
      exportedBy: actorRef,
      items,
    });
  });

  app.post('/v1/operations/import', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:import');

    // System-admin cannot import (needs real user as owner)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'invalid_subject', 'System admin cannot import entries directly');
    }

    const ownerUserId = auth.user?.id;
    if (!ownerUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const body = importRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    const results: Array<{
      success: boolean;
      entry: ReturnType<typeof toKnowledgeEntry> | null;
      error: string | null;
      source: 'json' | 'claude-skill';
    }> = [];

    let importedCount = 0;
    let failedCount = 0;

    await app.skillShareer.store.transact(async (data) => {
      for (const entryPayload of body.entries) {
        // Validate requestedLevel <= auth.securityLevel
        if (entryPayload.requestedLevel > auth.securityLevel) {
          results.push({
            success: false,
            entry: null,
            error: `requestedLevel ${entryPayload.requestedLevel} exceeds user level ${auth.securityLevel}`,
            source: entryPayload.source,
          });
          failedCount++;
          continue;
        }

        // Run pre-review
        const preReview = await runPreReview({
          existingEntries: data.knowledgeEntries,
          submission: entryPayload,
        });

        // Create imported entry
        const importedRecord = createImportedEntry({
          store: app.skillShareer.store,
          data,
          ownerUserId,
          teamId: auth.activeTeamId,
          payload: entryPayload,
          requestedLevel: entryPayload.requestedLevel,
          source: entryPayload.source,
          createdAt: nowIso(),
          preReview,
        });

        data.knowledgeEntries.push(importedRecord);

        // Record audit event for successful import
        const auditEvent = createAuditEvent({
          store: app.skillShareer.store,
          data,
          teamId: auth.activeTeamId,
          actor: auth,
          action: 'knowledge-imported',
          entityId: importedRecord.id,
          payload: { source: entryPayload.source, requestedLevel: entryPayload.requestedLevel },
        });
        data.auditEvents.push(auditEvent);

        results.push({
          success: true,
          entry: toKnowledgeEntry(data, importedRecord),
          error: null,
          source: entryPayload.source,
        });
        importedCount++;
      }
    });

    return importResponseSchema.parse({
      results: results.map((r) =>
        importResultItemSchema.parse({
          success: r.success,
          entry: r.entry,
          error: r.error,
          source: r.source,
        }),
      ),
      importedCount,
      failedCount,
    });
  });
};
