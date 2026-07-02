/**
 * POST /v1/operations/feedback/batch — Batch operations (resolve/dismiss/triage/transition).
 */

import {
  type FeedbackBatchItem,
  feedbackBatchRequestSchema,
  feedbackBatchResponseSchema,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';

import {
  checkLifecycleTriggers,
  getLifecycleTriggerRules,
} from '@trapmap/server/lib/feedback/lifecycle-triggers.js';
import { saveKnowledgeEntry } from '@trapmap/server/lib/knowledge/index.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export function registerFeedbackBatchRoute(app: FastifyInstance) {
  app.post('/v1/operations/feedback/batch', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Parse body
    const body = feedbackBatchRequestSchema.parse(request.body);
    const appliedAt = nowIso();

    const { feedback: feedbackRepo } = app.skillShareer.repos;

    // Build result items using repository
    const resultItems: FeedbackBatchItem[] = [];

    for (const feedbackId of body.feedbackIds) {
      const feedback = await feedbackRepo.getById(feedbackId);
      let eligible = false;
      let reason: string | null = null;
      const transitionApplied = false;

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

    // Execute the batch operation using repository
    for (const item of resultItems) {
      if (!item.eligible) continue;

      const updates: Partial<FeedbackQueueRecord> = { updatedAt: appliedAt };

      switch (body.action) {
        case 'resolve':
          updates.status = 'resolved';
          updates.resolvedAt = appliedAt;
          updates.resolvedByUserId = auth.user?.id ?? null;
          if (body.notes) {
            updates.adminNotes = body.notes;
          }
          break;
        case 'dismiss':
          updates.status = 'dismissed';
          if (body.notes) {
            updates.adminNotes = body.notes;
          }
          break;
        case 'triage':
          updates.status = 'triaged';
          if (body.notes) {
            updates.adminNotes = body.notes;
          }
          break;
        case 'transition':
          updates.triggeredTransition = body.transitionTarget ?? null;
          item.transitionApplied = true;
          if (body.notes) {
            updates.adminNotes = body.notes;
          }
          break;
      }

      await feedbackRepo.update(item.feedbackId, updates);
    }

    // After batch execution, evaluate lifecycle triggers for affected entries
    const lifecycleTransitions: Array<{ entryId: string; toState: string; reason: string }> = [];

    if (!body.dryRun) {
      const rules = getLifecycleTriggerRules();
      const lifecycleNow = new Date();

      // Collect unique entry IDs from eligible items using repository
      const affectedEntryIds = [
        ...new Set(
          (
            await Promise.all(
              resultItems
                .filter((i) => i.eligible)
                .map(async (i) => {
                  const fb = await feedbackRepo.getById(i.feedbackId);
                  return fb?.entryId;
                }),
            )
          ).filter((id): id is string => id !== undefined),
        ),
      ];

      for (const entryId of affectedEntryIds) {
        // Get feedback for this entry using repository
        const entryFeedback = await feedbackRepo.listByEntry(entryId);
        const result = checkLifecycleTriggers(entryId, entryFeedback, rules, lifecycleNow);
        if (result.shouldTransition && result.targetState) {
          const entry = await app.skillShareer.repos.knowledge.getById(entryId);
          if (entry) {
            const updatedAt = lifecycleNow.toISOString();
            entry.decayMeta = {
              lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
              decayState: result.targetState,
              supersededById: entry.decayMeta?.supersededById ?? null,
              decayStateComputedAt: updatedAt,
              freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
            };
            entry.updatedAt = updatedAt;
            await saveKnowledgeEntry(app.skillShareer.repos.knowledge, entry);
          }
          lifecycleTransitions.push({
            entryId,
            toState: result.targetState,
            reason: result.reason,
          });
        }
      }
    }

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
        lifecycleTransitions,
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
}
