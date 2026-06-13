import { feedbackResponseSchema, feedbackSubmissionSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { scheduleSharedJob } from '@trapmap/server/lib/jobs/index.js';
import { BADCASE_EXPORT_DRAFT_TASK_TYPE } from '@trapmap/server/lib/jobs/types.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

/**
 * Threshold configuration for automatic transition triggers.
 * When recurring patterns are detected, the entry is flagged for admin review.
 */
const TRANSITION_TRIGGERS = {
  outdated: { threshold: 3, targetState: 'stale', timeWindowDays: 30 },
  incorrect: { threshold: 5, targetState: 'review-due', timeWindowDays: 30 },
} as const;

async function persistBadcaseTrace(
  app: Parameters<FastifyPluginAsync>[0],
  feedbackId: string,
  payload: {
    entryId: string;
    entryType: 'trap' | 'skill';
    querySeed: string | null;
    queryId: string | null;
    routeFamily: 'entry' | 'capsule' | 'graph-plan' | null;
    failureClassification: string | null;
    expectedCorrection: string | null;
    selectedResultSnapshot: Record<string, unknown> | null;
  },
) {
  const store = app.skillShareer.store;
  if (!(store instanceof PostgresStore)) return;
  try {
    await store.getPool().query(
      `INSERT INTO retrieval_badcase_traces
       (id, feedback_id, query_id, query_seed, route_family, entry_id, entry_type, failure_classification, expected_correction, selected_result_snapshot, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), NOW())`,
      [
        `badcase_${feedbackId}`,
        feedbackId,
        payload.queryId,
        payload.querySeed,
        payload.routeFamily,
        payload.entryId,
        payload.entryType,
        payload.failureClassification,
        payload.expectedCorrection,
        payload.selectedResultSnapshot ? JSON.stringify(payload.selectedResultSnapshot) : null,
      ],
    );
  } catch {
    // Best-effort trace capture must not break feedback submission.
  }
}

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Require authentication
    if (!auth.user?.id) {
      throw new AppError(401, 'unauthorized', 'Not authenticated');
    }

    // Validate request body
    const payload = feedbackSubmissionSchema.parse(request.body);

    // Persist feedback to queue using repository
    const { feedback: feedbackRepo } = app.skillShareer.repos;
    const id = await feedbackRepo.nextId();
    const now = nowIso();

    // Check for automatic transition trigger
    let flaggedForTransition: string | null = null;
    if (payload.problemType === 'outdated' || payload.problemType === 'incorrect') {
      const trigger = TRANSITION_TRIGGERS[payload.problemType];
      const cutoffDate = new Date(Date.now() - trigger.timeWindowDays * 24 * 60 * 60 * 1000);

      const recentSimilarFeedback = await feedbackRepo.listByFilter({
        entryId: payload.entryId,
        problemType: [payload.problemType],
      });
      const recentCount = recentSimilarFeedback.filter(
        (f) => new Date(f.submittedAt) >= cutoffDate,
      ).length;

      // Including this new feedback, check if threshold is met
      if (recentCount + 1 >= trigger.threshold) {
        flaggedForTransition = trigger.targetState;
      }
    }

    const feedbackRecord = {
      id,
      entryId: payload.entryId,
      entryType: payload.entryType,
      problemType: payload.problemType,
      description: payload.description,
      context: payload.context ?? null,
      querySeed: payload.querySeed ?? null,
      queryId: payload.badcase?.queryId ?? null,
      routeFamily: payload.badcase?.routeFamily ?? null,
      failureClassification: payload.badcase?.failureClassification ?? null,
      expectedCorrection: payload.badcase?.expectedCorrection ?? null,
      selectedResultSnapshot: payload.badcase?.selectedResultSnapshot ?? null,
      customAnswers: payload.customAnswers ?? null,
      submittedAt: now,
      submittedByUserId: auth.user!.id,
      submittedByHandle: auth.handle,
      status: 'new' as const,
      adminNotes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      triggeredTransition: flaggedForTransition,
      createdAt: now,
      updatedAt: now,
    };

    await feedbackRepo.insert(feedbackRecord);
    await persistBadcaseTrace(app, feedbackRecord.id, {
      entryId: feedbackRecord.entryId,
      entryType: feedbackRecord.entryType,
      querySeed: feedbackRecord.querySeed,
      queryId: feedbackRecord.queryId,
      routeFamily: feedbackRecord.routeFamily,
      failureClassification: feedbackRecord.failureClassification,
      expectedCorrection: feedbackRecord.expectedCorrection,
      selectedResultSnapshot: feedbackRecord.selectedResultSnapshot,
    });
    if (payload.badcase) {
      await scheduleSharedJob(
        app.skillShareer.store,
        BADCASE_EXPORT_DRAFT_TASK_TYPE,
        {
          feedbackId: feedbackRecord.id,
          entryId: feedbackRecord.entryId,
          entryType: feedbackRecord.entryType,
          queryId: feedbackRecord.queryId,
        },
        `${BADCASE_EXPORT_DRAFT_TASK_TYPE}:${feedbackRecord.id}`,
      );
    }

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'feedback',
      targetId: feedbackRecord.id,
      teamId: auth.activeTeamId,
      metadata: {
        entryId: payload.entryId,
        entryType: payload.entryType,
        problemType: payload.problemType,
      },
    });

    // Return response with actor ref format
    // Build response object, omitting null optional fields (Zod optional expects undefined, not null)
    const feedback = {
      id: feedbackRecord.id,
      entryId: feedbackRecord.entryId,
      entryType: feedbackRecord.entryType,
      problemType: feedbackRecord.problemType,
      description: feedbackRecord.description,
      ...(feedbackRecord.context != null ? { context: feedbackRecord.context } : {}),
      ...(feedbackRecord.querySeed != null ? { querySeed: feedbackRecord.querySeed } : {}),
      ...(feedbackRecord.queryId != null ? { queryId: feedbackRecord.queryId } : {}),
      ...(feedbackRecord.routeFamily != null ? { routeFamily: feedbackRecord.routeFamily } : {}),
      ...(feedbackRecord.failureClassification != null
        ? { failureClassification: feedbackRecord.failureClassification }
        : {}),
      ...(feedbackRecord.expectedCorrection != null
        ? { expectedCorrection: feedbackRecord.expectedCorrection }
        : {}),
      ...(feedbackRecord.selectedResultSnapshot != null
        ? { selectedResultSnapshot: feedbackRecord.selectedResultSnapshot }
        : {}),
      ...(payload.badcase ? { badcase: payload.badcase } : {}),
      ...(payload.badcase ? { asyncJobId: `wf_badcase_${feedbackRecord.id}` } : {}),
      ...(feedbackRecord.customAnswers != null
        ? { customAnswers: feedbackRecord.customAnswers }
        : {}),
      submittedAt: feedbackRecord.submittedAt,
      submittedBy: {
        id: auth.user!.id,
        handle: auth.handle,
        securityLevel: auth.securityLevel,
      },
      status: feedbackRecord.status,
      ...(feedbackRecord.adminNotes != null ? { adminNotes: feedbackRecord.adminNotes } : {}),
    };

    return reply.status(201).send(feedbackResponseSchema.parse({ feedback }));
  });
};
