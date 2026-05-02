/**
 * Admin feedback management routes.
 *
 * Provides endpoints for listing and batch processing the feedback queue.
 * Implements FEEDBACK-02 (admin batch review) and FEEDBACK-03 (lifecycle integration).
 */

import type {
  FeedbackListResponse,
  FeedbackBatchResponse,
  FeedbackQualityScore,
} from '@trapmap/contracts';
import {
  feedbackListRequestSchema,
  feedbackListResponseSchema,
  feedbackListItemSchema,
  feedbackBatchRequestSchema,
  feedbackBatchResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { planFeedbackBatch, executeFeedbackBatch } from '../lib/feedback/batch.js';
import { computeQualityScore } from '../lib/feedback/quality-score.js';
import { getLifecycleTriggerRules } from '../lib/feedback/lifecycle-triggers.js';
import { AppError } from '../lib/errors.js';
import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '../lib/user-ops-log.js';

export const adminFeedbackRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/admin/feedback
   *
   * List feedback queue with filtering options.
   */
  app.get('/v1/admin/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = feedbackListRequestSchema.parse(request.query);
    const data = await app.skillShareer.store.snapshot();
    const now = new Date();

    // Filter feedback queue
    let items = data.feedbackQueue;

    if (query.status?.length) {
      items = items.filter((f) => query.status!.includes(f.status));
    }
    if (query.problemType?.length) {
      items = items.filter((f) => query.problemType!.includes(f.problemType));
    }
    if (query.entryId) {
      items = items.filter((f) => f.entryId === query.entryId);
    }
    if (query.entryType) {
      items = items.filter((f) => f.entryType === query.entryType);
    }

    // Age filtering
    if (query.ageMinDays !== undefined || query.ageMaxDays !== undefined) {
      items = items.filter((f) => {
        const ageDays =
          (now.getTime() - new Date(f.submittedAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (query.ageMinDays !== undefined && ageDays < query.ageMinDays)
          return false;
        if (query.ageMaxDays !== undefined && ageDays > query.ageMaxDays)
          return false;
        return true;
      });
    }

    // Enrich with entry shortcut and compute age
    const enrichedItems = items.map((f) => {
      const entry =
        data.knowledgeEntries.find((e) => e.id === f.entryId) ??
        data.skillArtifacts.find((a) => a.id === f.entryId);

      return feedbackListItemSchema.parse({
        id: f.id,
        entryId: f.entryId,
        entryType: f.entryType,
        entryShortcut: entry?.shortcut ?? entry?.slug ?? '[deleted]',
        problemType: f.problemType,
        description: f.description,
        context: f.context,
        submittedAt: f.submittedAt,
        submittedByHandle: f.submittedByHandle,
        status: f.status,
        adminNotes: f.adminNotes,
        ageDays:
          (now.getTime() - new Date(f.submittedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      });
    });

    // Sort by submittedAt descending
    enrichedItems.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    const total = enrichedItems.length;
    const limitedItems = enrichedItems.slice(0, query.limit);

    // Compute quality score if filtering by single entry
    let qualityScore: FeedbackQualityScore | undefined;
    if (query.entryId && limitedItems.length > 0) {
      qualityScore = computeQualityScore(
        query.entryId,
        data.feedbackQueue,
        now,
      );
    }

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'admin-feedback-list',
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
      nextCursor: null,
      ...(qualityScore ? { qualityScore } : {}),
    });
  });

  /**
   * POST /v1/admin/feedback/batch
   *
   * Execute or preview a batch operation on feedback items.
   */
  app.post('/v1/admin/feedback/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const body = feedbackBatchRequestSchema.parse(request.body);
    const now = new Date();

    const input = {
      feedbackIds: body.feedbackIds,
      action: body.action,
      actorId: auth.actorId,
      notes: body.notes,
      targetDecayState: body.targetDecayState,
    };

    if (body.dryRun) {
      // Dry-run mode: plan without executing
      const data = await app.skillShareer.store.snapshot();
      const planItems = planFeedbackBatch(data, input, now);

      const items = planItems.map((item) => ({
        feedbackId: item.feedbackId,
        entryId: item.entryId,
        entryShortcut: item.entryShortcut,
        currentStatus: item.currentStatus,
        proposedStatus: item.proposedStatus,
        changeDescription: item.changeDescription,
        eligible: item.eligible,
        ineligibilityReason: item.ineligibilityReason,
        resultingDecayState: item.resultingDecayState,
      }));

      const eligibleCount = items.filter((i) => i.eligible).length;

      // Log operation
      const logConfig = loadUserOpsLogConfig();
      await logUserOperation(logConfig, {
        timestamp: nowIso(),
        actorId: auth.actorId,
        actorHandle: auth.handle,
        action: 'admin-feedback-batch',
        targetId: null,
        teamId: auth.activeTeamId,
        metadata: {
          action: body.action,
          dryRun: true,
          feedbackCount: body.feedbackIds.length,
          eligibleCount,
        },
      });

      return feedbackBatchResponseSchema.parse({
        action: body.action,
        dryRun: true,
        items,
        totalEligible: eligibleCount,
        totalIneligible: items.length - eligibleCount,
        appliedAt: null,
      });
    }

    // Execute mode: plan first, then execute, then use pre-execution plan for response
    const preSnapshot = await app.skillShareer.store.snapshot();
    const planItems = planFeedbackBatch(preSnapshot, input, now);

    const items = planItems.map((item) => ({
      feedbackId: item.feedbackId,
      entryId: item.entryId,
      entryShortcut: item.entryShortcut,
      currentStatus: item.currentStatus,
      proposedStatus: item.proposedStatus,
      changeDescription: item.changeDescription,
      eligible: item.eligible,
      ineligibilityReason: item.ineligibilityReason,
      resultingDecayState: item.resultingDecayState,
    }));

    const eligibleCount = items.filter((i) => i.eligible).length;

    // Execute the batch mutation
    const mutatedRecords = await app.skillShareer.store.transact((data) => {
      return executeFeedbackBatch(app.skillShareer.store, data, input, now);
    });

    const appliedAt = nowIso();

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: appliedAt,
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'admin-feedback-batch',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        action: body.action,
        dryRun: false,
        feedbackCount: body.feedbackIds.length,
        eligibleCount,
        mutatedCount: mutatedRecords.length,
      },
    });

    return feedbackBatchResponseSchema.parse({
      action: body.action,
      dryRun: false,
      items,
      totalEligible: eligibleCount,
      totalIneligible: items.length - eligibleCount,
      appliedAt,
    });
  });
};
