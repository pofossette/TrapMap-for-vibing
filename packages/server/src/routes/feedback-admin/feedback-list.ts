/**
 * GET /v1/operations/feedback — List feedback queue items with filtering support.
 */

import {
  type FeedbackListItem,
  feedbackListRequestSchema,
  feedbackListResponseSchema,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';

import {
  toFailureClassificationAwareFeedbackItem,
  buildOperatorEntryDisplayLookup,
} from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

import { computeAgeDays } from './helpers.js';

export function registerFeedbackListRoute(app: FastifyInstance) {
  app.get('/v1/operations/feedback', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Parse query parameters
    const query = feedbackListRequestSchema.parse(request.query);

    const { feedback: feedbackRepo } = app.skillShareer.repos;
    const now = new Date();

    // Filter feedback queue using repository
    const filter: {
      status?: string[];
      problemType?: string[];
      entryId?: string;
      entryType?: string;
    } = {};
    if (query.status) filter.status = query.status;
    if (query.problemType) filter.problemType = query.problemType;
    if (query.entryId) filter.entryId = query.entryId;
    if (query.entryType) filter.entryType = query.entryType;
    let filtered = await feedbackRepo.listByFilter(filter);

    // Filter by age
    for (const f of filtered) {
      const ageDays = computeAgeDays(f.submittedAt, now);
      (f as { _ageDays?: number })._ageDays = ageDays;
    }

    if (query.minAgeDays !== undefined) {
      filtered = filtered.filter(
        (f) => (f as { _ageDays?: number })._ageDays! >= query.minAgeDays!,
      );
    }

    if (query.maxAgeDays !== undefined) {
      filtered = filtered.filter(
        (f) => (f as { _ageDays?: number })._ageDays! <= query.maxAgeDays!,
      );
    }

    const entryDisplayLookup = await buildOperatorEntryDisplayLookup(app.skillShareer.repos);

    // Build response items
    const items: FeedbackListItem[] = filtered.map((f) =>
      toFailureClassificationAwareFeedbackItem(
        {
          id: f.id,
          entryId: f.entryId,
          entryType: f.entryType,
          entryShortcut: entryDisplayLookup.getEntryShortcut(f.entryId, f.entryType),
          problemType: f.problemType,
          description: f.description,
          context: f.context,
          submittedAt: f.submittedAt,
          submittedBy: {
            id: f.submittedByUserId,
            handle: f.submittedByHandle,
            securityLevel: 0,
          },
          status: f.status,
          ageDays: Math.round((f as { _ageDays?: number })._ageDays ?? 0),
          adminNotes: f.adminNotes,
        },
        f.failureClassification,
      ),
    );

    // Sort by submittedAt descending
    items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    // Apply limit
    const total = items.length;
    const limitedItems = items.slice(0, query.limit);

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'feedback-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        total,
        returned: limitedItems.length,
        filters: query,
      },
    });

    return feedbackListResponseSchema.parse({
      items: limitedItems,
      total,
    });
  });
}
