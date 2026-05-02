import {
  feedbackSubmissionSchema,
  feedbackResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Require authentication
    if (!auth.user?.id) {
      throw new AppError(401, 'unauthorized', 'Not authenticated');
    }

    // Validate request body
    const payload = feedbackSubmissionSchema.parse(request.body);

    // Persist feedback to queue
    const feedbackRecord = await app.skillShareer.store.transact((data) => {
      const id = app.skillShareer.store.nextId(data, 'feedback');
      const now = nowIso();

      const record = {
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
        createdAt: now,
        updatedAt: now,
      };

      data.feedbackQueue.push(record);
      return record;
    });

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
      ...(feedbackRecord.customAnswers != null ? { customAnswers: feedbackRecord.customAnswers } : {}),
      submittedAt: feedbackRecord.submittedAt,
      submittedBy: {
        id: auth.user!.id,
        handle: auth.handle,
        securityLevel: auth.securityLevel,
      },
      status: feedbackRecord.status,
      ...(feedbackRecord.adminNotes != null ? { adminNotes: feedbackRecord.adminNotes } : {}),
    };

    return reply.status(201).send(
      feedbackResponseSchema.parse({ feedback }),
    );
  });
};
