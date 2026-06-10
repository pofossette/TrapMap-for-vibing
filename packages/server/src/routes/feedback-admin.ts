/**
 * Admin feedback management routes.
 *
 * Provides endpoints for the admin feedback review workflow (FEEDBACK-02):
 * - GET /v1/operations/feedback: List feedback queue with filters
 * - POST /v1/operations/feedback/batch: Batch operations (resolve/dismiss/triage/transition)
 * - GET /v1/operations/feedback/stats/:entryId: Quality score for an entry
 */

import {
  type FeedbackBatchItem,
  type FeedbackListItem,
  type FeedbackRemediationQueueItem,
  type QualityScore,
  feedbackBatchRequestSchema,
  feedbackBatchResponseSchema,
  feedbackListRequestSchema,
  feedbackListResponseSchema,
  feedbackRemediationCompleteRequestSchema,
  feedbackRemediationCompleteResponseSchema,
  feedbackRemediationDetailResponseSchema,
  feedbackRemediationQueueResponseSchema,
  feedbackStatsResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  checkLifecycleTriggers,
  getLifecycleTriggerRules,
} from '@trapmap/server/lib/feedback/lifecycle-triggers.js';
import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  computeFeedbackRemediationState,
  getActiveEntryFeedback,
} from '@trapmap/server/lib/feedback/remediation.js';
import { runKnowledgeIndexEvent } from '@trapmap/server/lib/indexing/events.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

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

async function buildRemediationQueueItems(app: Parameters<FastifyPluginAsync>[0]) {
  const {
    feedback: feedbackRepo,
    knowledge: knowledgeRepo,
    artifact: artifactRepo,
  } = app.skillShareer.repos;
  const now = new Date();
  const allFeedback = await feedbackRepo.listByFilter({});
  const grouped = new Map<string, FeedbackQueueRecord[]>();

  for (const record of allFeedback) {
    const existing = grouped.get(record.entryId) ?? [];
    existing.push(record);
    grouped.set(record.entryId, existing);
  }

  const items: FeedbackRemediationQueueItem[] = [];

  for (const [entryId, entryFeedback] of grouped) {
    const remediation = computeFeedbackRemediationState(
      entryFeedback,
      entryId,
      FEEDBACK_REMEDIATION_THRESHOLD,
    );
    if (!remediation) continue;

    const knowledgeEntry = await knowledgeRepo.getById(entryId);
    const skillArtifact = knowledgeEntry ? null : await artifactRepo.getById(entryId);
    if (!knowledgeEntry && !skillArtifact) continue;

    const entryType = knowledgeEntry ? 'trap' : 'skill';
    const title = knowledgeEntry?.shortcut ?? skillArtifact?.title ?? 'unknown';
    const unresolved = getActiveEntryFeedback(entryFeedback, entryId);
    const recentFeedback: FeedbackListItem[] = [...entryFeedback]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        entryId: f.entryId,
        entryType: f.entryType,
        entryShortcut: title,
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

    items.push({
      entryId,
      entryType,
      title,
      remediation,
      unresolvedFeedbackCount: unresolved.length,
      sourceSnapshot: knowledgeEntry
        ? {
            trapDetail: knowledgeEntry.detail,
          }
        : {
            skillRevision: skillArtifact?.latestRevision.revision ?? null,
            skillProfileSummary: skillArtifact?.latestRevision.derived?.profile?.summary ?? null,
            skillCapsules:
              skillArtifact?.latestRevision.derived?.capsules.map((capsule) => ({
                capsuleId: capsule.capsuleId,
                problem: capsule.problem,
                content: capsule.content,
              })) ?? [],
          },
      recentFeedback,
    });
  }

  items.sort((a, b) => {
    const aOpened = a.remediation.openedAt ?? '';
    const bOpened = b.remediation.openedAt ?? '';
    return bOpened.localeCompare(aOpened);
  });

  return items;
}

export const feedbackAdminRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/operations/feedback
   *
   * List feedback queue items with filtering support.
   */
  app.get('/v1/operations/feedback', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Parse query parameters
    const query = feedbackListRequestSchema.parse(request.query);

    const { feedback: feedbackRepo, knowledge: knowledgeRepo } = app.skillShareer.repos;
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

    // Build lookup maps for entry shortcuts using repositories
    const knowledgeEntries = await knowledgeRepo.listByFilter({});
    const knowledgeEntryMap = new Map(knowledgeEntries.map((e) => [e.id, e.shortcut]));
    // skillArtifacts are read-only for shortcut lookup; keep store access for now
    const data = await app.skillShareer.store.snapshot();
    const skillArtifactMap = new Map(data.skillArtifacts.map((a) => [a.id, a.slug]));

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

  app.get('/v1/operations/feedback/remediation', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const items = await buildRemediationQueueItems(app);

    return feedbackRemediationQueueResponseSchema.parse({
      items,
      total: items.length,
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

  /**
   * POST /v1/operations/feedback/batch
   *
   * Execute batch operations on feedback items.
   */
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
          // NOTE: No repo method exists for decayMeta updates.
          // Using store.transact() for this specific mutation (deviation from plan).
          await app.skillShareer.store.transact((data) => {
            const entry = data.knowledgeEntries.find((e) => e.id === entryId);
            if (entry) {
              entry.decayMeta = {
                lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
                decayState: result.targetState!,
                supersededById: entry.decayMeta?.supersededById ?? null,
                decayStateComputedAt: lifecycleNow.toISOString(),
                freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
              };
              entry.updatedAt = lifecycleNow.toISOString();
            }
          });
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

    if (entryType === 'trap') {
      const entry = await app.skillShareer.repos.knowledge.getById(entryId);
      if (!entry) {
        throw new AppError(404, 'not_found', 'Knowledge entry not found');
      }

      await runKnowledgeIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
          ai: { chat: app.skillShareer.ai.chat },
          graphQueryBackend: app.skillShareer.graphQueryBackend,
        },
        entryId,
        previousState: entry.lifecycleState,
        nextState: entry.lifecycleState,
        reason: 'updated',
        registry: app.skillShareer.adapterRegistry,
      });
    } else {
      const artifact = await app.skillShareer.repos.artifact.getById(entryId);
      if (!artifact) {
        throw new AppError(404, 'not_found', 'Skill artifact not found');
      }

      await runSkillIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
          ai: { chat: app.skillShareer.ai.chat },
          graphQueryBackend: app.skillShareer.graphQueryBackend,
        },
        artifactId: entryId,
        previousState: artifact.lifecycleState,
        nextState: artifact.lifecycleState,
        reason: 'updated',
      });
    }

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

    return feedbackRemediationCompleteResponseSchema.parse({
      entryId,
      entryType,
      resolvedFeedbackIds: unresolved.map((feedback) => feedback.id),
      resolvedCount: unresolved.length,
      resolvedAt: appliedAt,
    });
  });

  /**
   * GET /v1/operations/feedback/stats/:entryId
   *
   * Get quality score for a knowledge entry.
   */
  app.get('/v1/operations/feedback/stats/:entryId', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    // Get path params
    const params = request.params as { entryId: string };
    const entryId = params.entryId;

    const {
      feedback: feedbackRepo,
      knowledge: knowledgeRepo,
      artifact: artifactRepo,
    } = app.skillShareer.repos;
    const now = new Date();

    // Find entry to determine type using repositories
    const knowledgeEntry = await knowledgeRepo.getById(entryId);
    const skillArtifact = knowledgeEntry ? null : await artifactRepo.getById(entryId);

    if (!knowledgeEntry && !skillArtifact) {
      throw new AppError(404, 'not_found', 'Entry not found');
    }

    const entryType = knowledgeEntry ? 'trap' : 'skill';
    const entryShortcut = knowledgeEntry?.shortcut ?? skillArtifact?.slug ?? 'unknown';

    // Filter feedback by entry ID using repository
    const entryFeedback = await feedbackRepo.listByEntry(entryId);

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
