/**
 * Admin feedback management routes.
 *
 * Provides endpoints for the admin feedback review workflow (FEEDBACK-02):
 * - GET /v1/operations/feedback: List feedback queue with filters
 * - POST /v1/operations/feedback/batch: Batch operations (resolve/dismiss/triage/transition)
 * - GET /v1/operations/feedback/stats/:entryId: Quality score for an entry
 */

import {
  feedbackListRequestSchema,
  feedbackListResponseSchema,
  feedbackBatchRequestSchema,
  feedbackBatchResponseSchema,
  feedbackStatsResponseSchema,
  type QualityScore,
  type FeedbackListItem,
  type FeedbackBatchItem,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import type { FeedbackQueueRecord } from '../lib/store.js';
import { nowIso } from '../lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '../lib/user-ops-log.js';

/**
 * Compute age in days from a timestamp to now.
 */
function computeAgeDays(submittedAt: string, now: Date): number {
  const submitted = new Date(submittedAt);
  const ageMs = now.getTime() - submitted.getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Compute quality score from feedback records.
 * Quality score ranges from 0 to 1, with 1 being highest quality.
 */
function computeQualityScore(feedback: FeedbackQueueRecord[]): QualityScore {
  const totalFeedback = feedback.length;
  const unresolvedFeedback = feedback.filter(
    (f) => f.status === 'new' || f.status === 'triaged',
  ).length;
  const outdatedReports = feedback.filter((f) => f.problemType === 'outdated').length;
  const incorrectReports = feedback.filter((f) => f.problemType === 'incorrect').length;

  const lastFeedbackAt =
    feedback.length > 0
      ? feedback.reduce(
          (latest, f) => (f.submittedAt > latest ? f.submittedAt : latest),
          feedback[0]!.submittedAt,
        )
      : null;

  // Quality score calculation:
  // Base: 1.0, penalty per unresolved: -0.1, extra penalty for incorrect: -0.05, outdated: -0.05
  let score = 1.0;
  score -= unresolvedFeedback * 0.1;
  score -= incorrectReports * 0.05; // Additional penalty
  score -= outdatedReports * 0.05; // Additional penalty
  score = Math.max(0, Math.min(1, score));

  return {
    totalFeedback,
    unresolvedFeedback,
    outdatedReports,
    incorrectReports,
    qualityScore: Math.round(score * 100) / 100,
    lastFeedbackAt,
  };
}

export const feedbackAdminRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/operations/feedback
   *
   * List feedback queue items with filtering support.
   */
  app.get('/v1/operations/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Parse query parameters
    const query = feedbackListRequestSchema.parse(request.query);

    // Get snapshot
    const data = await app.skillShareer.store.snapshot();
    const now = new Date();

    // Filter feedback queue
    let filtered = [...data.feedbackQueue];

    // Filter by status
    if (query.status && query.status.length > 0) {
      filtered = filtered.filter((f) => query.status!.includes(f.status));
    }

    // Filter by problem type
    if (query.problemType && query.problemType.length > 0) {
      filtered = filtered.filter((f) => query.problemType!.includes(f.problemType));
    }

    // Filter by entry ID
    if (query.entryId) {
      filtered = filtered.filter((f) => f.entryId === query.entryId);
    }

    // Filter by entry type
    if (query.entryType) {
      filtered = filtered.filter((f) => f.entryType === query.entryType);
    }

    // Filter by age
    for (const f of filtered) {
      const ageDays = computeAgeDays(f.submittedAt, now);
      (f as { _ageDays?: number })._ageDays = ageDays;
    }

    if (query.minAgeDays !== undefined) {
      filtered = filtered.filter((f) => (f as { _ageDays?: number })._ageDays! >= query.minAgeDays!);
    }

    if (query.maxAgeDays !== undefined) {
      filtered = filtered.filter((f) => (f as { _ageDays?: number })._ageDays! <= query.maxAgeDays!);
    }

    // Build lookup maps for entry shortcuts
    const knowledgeEntryMap = new Map(
      data.knowledgeEntries.map((e) => [e.id, e.shortcut]),
    );
    const skillArtifactMap = new Map(
      data.skillArtifacts.map((a) => [a.id, a.slug]),
    );

    // Build response items
    const items: FeedbackListItem[] = filtered.map((f) => {
      const entryShortcut =
        f.entryType === 'trap'
          ? (knowledgeEntryMap.get(f.entryId) ?? 'unknown')
          : (skillArtifactMap.get(f.entryId) ?? 'unknown');

      return {
        id: f.id,
        entryId: f.entryId,
        entryType: f.entryType,
        entryShortcut,
        problemType: f.problemType,
        description: f.description,
        context: f.context,
        submittedAt: f.submittedAt,
        submittedBy: {
          id: f.submittedByUserId,
          handle: f.submittedByHandle,
          securityLevel: 0, // We don't have this info stored, default to 0
        },
        status: f.status,
        ageDays: Math.round((f as { _ageDays?: number })._ageDays ?? 0),
        adminNotes: f.adminNotes,
      };
    });

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

  /**
   * POST /v1/operations/feedback/batch
   *
   * Execute batch operations on feedback items.
   */
  app.post('/v1/operations/feedback/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Parse body
    const body = feedbackBatchRequestSchema.parse(request.body);
    const now = new Date();
    const appliedAt = nowIso();

    // Get snapshot for dry-run or for planning
    const data = await app.skillShareer.store.snapshot();

    // Build result items
    const resultItems: FeedbackBatchItem[] = [];
    const feedbackMap = new Map(data.feedbackQueue.map((f) => [f.id, f]));

    for (const feedbackId of body.feedbackIds) {
      const feedback = feedbackMap.get(feedbackId);
      let eligible = false;
      let reason: string | null = null;
      let transitionApplied = false;

      if (!feedback) {
        reason = 'Feedback not found';
      } else if (feedback.status === 'resolved' || feedback.status === 'dismissed') {
        reason = `Feedback already ${feedback.status}`;
      } else {
        // Check action-specific eligibility
        switch (body.action) {
          case 'resolve':
            eligible = true;
            break;
          case 'dismiss':
            eligible = true;
            break;
          case 'triage':
            eligible = feedback.status === 'new';
            if (!eligible) {
              reason = 'Only new feedback can be triaged';
            }
            break;
          case 'transition':
            if (!body.transitionTarget) {
              reason = 'transitionTarget required for transition action';
            } else {
              eligible = true;
            }
            break;
        }
      }

      resultItems.push({
        feedbackId,
        eligible,
        reason,
        transitionApplied,
      });
    }

    const totalEligible = resultItems.filter((i) => i.eligible).length;
    const totalIneligible = resultItems.length - totalEligible;

    // If dry-run, return without persisting
    if (body.dryRun) {
      // Log operation
      const logConfig = loadUserOpsLogConfig();
      await logUserOperation(logConfig, {
        timestamp: nowIso(),
        actorId: auth.actorId,
        actorHandle: auth.handle,
        action: 'feedback-batch',
        targetId: null,
        teamId: auth.activeTeamId,
        metadata: {
          action: body.action,
          dryRun: true,
          feedbackCount: body.feedbackIds.length,
          eligibleCount: totalEligible,
        },
      });

      return feedbackBatchResponseSchema.parse({
        action: body.action,
        dryRun: true,
        items: resultItems,
        totalEligible,
        totalIneligible,
        appliedAt: null,
      });
    }

    // Execute the batch operation
    await app.skillShareer.store.transact((txData) => {
      const txFeedbackMap = new Map(txData.feedbackQueue.map((f) => [f.id, f]));

      for (const item of resultItems) {
        if (!item.eligible) continue;

        const feedback = txFeedbackMap.get(item.feedbackId);
        if (!feedback) continue;

        feedback.updatedAt = appliedAt;

        switch (body.action) {
          case 'resolve':
            feedback.status = 'resolved';
            feedback.resolvedAt = appliedAt;
            feedback.resolvedByUserId = auth.user?.id ?? null;
            if (body.notes) {
              feedback.adminNotes = body.notes;
            }
            break;
          case 'dismiss':
            feedback.status = 'dismissed';
            if (body.notes) {
              feedback.adminNotes = body.notes;
            }
            break;
          case 'triage':
            feedback.status = 'triaged';
            if (body.notes) {
              feedback.adminNotes = body.notes;
            }
            break;
          case 'transition':
            feedback.triggeredTransition = body.transitionTarget ?? null;
            item.transitionApplied = true;
            if (body.notes) {
              feedback.adminNotes = body.notes;
            }
            break;
        }
      }
    });

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: appliedAt,
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'feedback-batch',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        action: body.action,
        dryRun: false,
        feedbackCount: body.feedbackIds.length,
        eligibleCount: totalEligible,
      },
    });

    return feedbackBatchResponseSchema.parse({
      action: body.action,
      dryRun: false,
      items: resultItems,
      totalEligible,
      totalIneligible,
      appliedAt,
    });
  });

  /**
   * GET /v1/operations/feedback/stats/:entryId
   *
   * Get quality score for a knowledge entry.
   */
  app.get('/v1/operations/feedback/stats/:entryId', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Get path params
    const params = request.params as { entryId: string };
    const entryId = params.entryId;

    // Get snapshot
    const data = await app.skillShareer.store.snapshot();
    const now = new Date();

    // Find entry to determine type
    const knowledgeEntry = data.knowledgeEntries.find((e) => e.id === entryId);
    const skillArtifact = data.skillArtifacts.find((a) => a.id === entryId);

    if (!knowledgeEntry && !skillArtifact) {
      throw new AppError(404, 'not_found', 'Entry not found');
    }

    const entryType = knowledgeEntry ? 'trap' : 'skill';
    const entryShortcut = knowledgeEntry?.shortcut ?? skillArtifact?.slug ?? 'unknown';

    // Filter feedback by entry ID
    const entryFeedback = data.feedbackQueue.filter((f) => f.entryId === entryId);

    // Compute quality score
    const quality = computeQualityScore(entryFeedback);

    // Get recent feedback (up to 10)
    const recentFeedback: FeedbackListItem[] = entryFeedback
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        entryId: f.entryId,
        entryType: f.entryType,
        entryShortcut,
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
        ageDays: Math.round(computeAgeDays(f.submittedAt, now)),
        adminNotes: f.adminNotes,
      }));

    return feedbackStatsResponseSchema.parse({
      entryId,
      entryType,
      quality,
      recentFeedback,
    });
  });
};
