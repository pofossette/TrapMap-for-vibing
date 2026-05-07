import { feedbackResponseSchema, feedbackSubmissionSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

/**
 * Threshold configuration for automatic transition triggers.
 * When recurring patterns are detected, the entry is flagged for admin review.
 */
const TRANSITION_TRIGGERS = {
  outdated: { threshold: 3, targetState: 'stale', timeWindowDays: 30 },
  incorrect: { threshold: 5, targetState: 'review-due', timeWindowDays: 30 },
} as const;

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
