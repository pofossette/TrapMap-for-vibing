/**
 * Remediation queue routes:
 * - GET  /v1/operations/feedback/remediation
 * - GET  /v1/operations/feedback/remediation/:entryId
 * - POST /v1/operations/feedback/remediation/:entryId/complete
 */

import {
  feedbackRemediationCompleteRequestSchema,
  feedbackRemediationCompleteResponseSchema,
  feedbackRemediationDetailResponseSchema,
  feedbackRemediationQueueResponseSchema,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  getActiveEntryFeedback,
} from '@trapmap/server/lib/feedback/remediation.js';
import { createSharedJobQueuePort, scheduleSharedJob } from '@trapmap/server/lib/jobs/index.js';
import { REMEDIATION_REACTIVATION_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import { getSharedJobWorkflowRunId } from '@trapmap/server/lib/jobs/types.js';
import { summarizeFailureClassifications } from '@trapmap/server/lib/operations/read-model.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import { buildRemediationQueueItems } from './helpers.js';

export function registerRemediationRoutes(app: FastifyInstance) {
  const sharedJobQueue = app.skillShareer.asyncTransport?.task
    ? createSharedJobQueuePort(app.skillShareer.asyncTransport.task)
    : undefined;

  app.get('/v1/operations/feedback/remediation', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const items = await buildRemediationQueueItems(app);
    const failureClassificationSummary = summarizeFailureClassifications(
      items.flatMap((item) => item.recentFeedback),
    );

    return feedbackRemediationQueueResponseSchema.parse({
      items,
      total: items.length,
      failureClassificationSummary,
    });
  });

  app.get('/v1/operations/feedback/remediation/:entryId', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const { entryId } = request.params as { entryId: string };
    const items = await buildRemediationQueueItems(app);
    const item = items.find((candidate) => candidate.entryId === entryId);
    if (!item) {
      throw new AppError(404, 'not_found', 'Remediation item not found');
    }

    return feedbackRemediationDetailResponseSchema.parse({ item });
  });

  app.post('/v1/operations/feedback/remediation/:entryId/complete', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const { entryId } = request.params as { entryId: string };
    const body = feedbackRemediationCompleteRequestSchema.parse(request.body);
    const appliedAt = nowIso();
    const { feedback: feedbackRepo } = app.skillShareer.repos;
    const all = await feedbackRepo.listByEntry(entryId);
    const unresolved = getActiveEntryFeedback(all, entryId);

    if (unresolved.length < FEEDBACK_REMEDIATION_THRESHOLD) {
      throw new AppError(409, 'not_escalated', 'Entry is not currently in remediation queue');
    }

    const entryType = unresolved[0]!.entryType;

    for (const feedback of unresolved) {
      await feedbackRepo.update(feedback.id, {
        status: 'resolved',
        adminNotes: body.notes,
        resolvedAt: appliedAt,
        resolvedByUserId: auth.user?.id ?? null,
        remediationStatus: 'ready-to-reindex',
        remediationResolvedAt: appliedAt,
        remediationResolvedByUserId: auth.user?.id ?? null,
      });
    }

    if (app.skillShareer.store instanceof PostgresStore) {
      await scheduleSharedJob(
        sharedJobQueue,
        app.skillShareer.store,
        REMEDIATION_REACTIVATION_TASK_TYPE,
        {
          entryId,
          entryType,
          feedbackIds: unresolved.map((feedback) => feedback.id),
          resolvedAt: appliedAt,
          resolvedByUserId: auth.user?.id ?? null,
          notes: body.notes ?? null,
        },
        `${REMEDIATION_REACTIVATION_TASK_TYPE}:${entryId}:${appliedAt}`,
      );
    }

    return feedbackRemediationCompleteResponseSchema.parse({
      entryId,
      entryType,
      resolvedFeedbackIds: unresolved.map((feedback) => feedback.id),
      resolvedCount: unresolved.length,
      resolvedAt: appliedAt,
      ...(app.skillShareer.store instanceof PostgresStore
        ? {
            asyncJobId: getSharedJobWorkflowRunId(REMEDIATION_REACTIVATION_TASK_TYPE, {
              entryId,
              entryType,
              feedbackIds: unresolved.map((feedback) => feedback.id),
              resolvedAt: appliedAt,
              resolvedByUserId: auth.user?.id ?? null,
              notes: body.notes ?? null,
            }),
          }
        : {}),
    });
  });
}
