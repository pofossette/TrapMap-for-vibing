/**
 * Shared helpers for feedback admin routes.
 */

import type { FastifyPluginAsync } from 'fastify';

import type { QualityScore } from '@trapmap/contracts';
import type { FeedbackListItem, FeedbackRemediationQueueItem } from '@trapmap/contracts';
import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  computeFeedbackRemediationState,
  getActiveEntryFeedback,
} from '@trapmap/server/lib/feedback/remediation.js';
import { toFailureClassificationAwareFeedbackItem } from '@trapmap/server/lib/operations/read-model.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';

/**
 * Compute age in days from a timestamp to now.
 */
export function computeAgeDays(submittedAt: string, now: Date): number {
  const submitted = new Date(submittedAt);
  const ageMs = now.getTime() - submitted.getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Compute quality score from feedback records.
 * Quality score ranges from 0 to 1, with 1 being highest quality.
 */
export function computeQualityScore(feedback: FeedbackQueueRecord[]): QualityScore {
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

export async function buildRemediationQueueItems(app: Parameters<FastifyPluginAsync>[0]) {
  const { feedback: feedbackRepo, knowledge: knowledgeRepo } = app.skillShareer.repos;
  const artifactReadProjection = app.skillShareer.artifactReadProjection;
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
    const skillArtifact = knowledgeEntry ? null : await artifactReadProjection.getById(entryId);
    if (!knowledgeEntry && !skillArtifact) continue;

    const entryType = knowledgeEntry ? 'trap' : 'skill';
    const title = knowledgeEntry?.shortcut ?? skillArtifact?.title ?? 'unknown';
    const unresolved = getActiveEntryFeedback(entryFeedback, entryId);
    const recentFeedback: FeedbackListItem[] = [...entryFeedback]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 10)
      .map((f) =>
        toFailureClassificationAwareFeedbackItem(
          {
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
          },
          f.failureClassification,
        ),
      );

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
