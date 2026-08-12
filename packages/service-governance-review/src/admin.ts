import {
  type AuditLogPort,
  type FeedbackRepositoryPort,
  InvocationError,
  type JobRuntimePort,
  FEEDBACK_REMEDIATION_THRESHOLD,
  activeFeedback,
  ageDays,
  batchActionEligibility,
  batchActionUpdates,
  failureClassificationSummary,
  matchesLifecycleTriggerRule,
  qualityScore,
  remediationState,
} from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  FeedbackBatchRequest,
  FeedbackBatchResponse,
  FeedbackListItem,
  FeedbackListRequest,
  FeedbackListResponse,
  FeedbackRemediationCompleteRequest,
  FeedbackRemediationCompleteResponse,
  FeedbackRemediationDetailResponse,
  FeedbackRemediationQueueItem,
  FeedbackRemediationQueueResponse,
  FeedbackStatsResponse,
  KnowledgeOwnerPort,
} from '@trapmap/contracts';
import {
  DEFAULT_LIFECYCLE_TRIGGER_RULES,
  feedbackBatchResponseSchema,
  feedbackListResponseSchema,
  feedbackRemediationCompleteResponseSchema,
  feedbackRemediationDetailResponseSchema,
  feedbackRemediationQueueResponseSchema,
  feedbackStatsResponseSchema,
  normalizeBadcaseTaxonomy,
  remediationReactivationPayloadSchema,
} from '@trapmap/contracts';

export interface GovernanceReviewAdminDeps {
  feedbackRepo: FeedbackRepositoryPort;
  knowledgeRead: Pick<KnowledgeOwnerPort, 'getById'>;
  artifactReadProjection: Pick<ArtifactReadProjection, 'getById'>;
  knowledgeWrite?: Pick<KnowledgeOwnerPort, 'applyDecayDecision'>;
  jobRuntime?: Pick<JobRuntimePort, 'schedule'>;
  auditLog?: AuditLogPort;
  now?: () => Date;
}

export interface GovernanceReviewAdminModule {
  list(input: {
    actorId: string;
    query: FeedbackListRequest;
  }): Promise<FeedbackListResponse>;
  stats(input: { actorId: string; entryId: string }): Promise<FeedbackStatsResponse>;
  batch(input: {
    actorId: string;
    command: FeedbackBatchRequest;
  }): Promise<FeedbackBatchResponse>;
  listRemediation(input: { actorId: string }): Promise<FeedbackRemediationQueueResponse>;
  getRemediation(input: {
    actorId: string;
    entryId: string;
  }): Promise<FeedbackRemediationDetailResponse>;
  completeRemediation(input: {
    actorId: string;
    entryId: string;
    command: FeedbackRemediationCompleteRequest;
  }): Promise<FeedbackRemediationCompleteResponse>;
}

type AdminFeedbackRecord = FeedbackRepositoryRecord & {
  entryType: 'trap' | 'skill';
  description: string;
  context: string | null;
  submittedAt: string;
  submittedByUserId: string;
  submittedByHandle: string;
  adminNotes?: string | null;
  failureClassification?: string | null;
};

type FeedbackRepositoryRecord = Awaited<
  ReturnType<FeedbackRepositoryPort['getById']>
> extends infer T
  ? Exclude<T, null>
  : never;

async function entryShortcut(
  record: AdminFeedbackRecord,
  deps: GovernanceReviewAdminDeps,
): Promise<string> {
  if (record.entryType === 'skill') {
    const artifact = await deps.artifactReadProjection.getById(record.entryId);
    return artifact?.slug ?? artifact?.title ?? 'unknown';
  }
  const entry = await deps.knowledgeRead.getById(record.entryId);
  return entry?.shortcut ?? 'unknown';
}

async function toFeedbackItem(
  record: AdminFeedbackRecord,
  now: Date,
  deps: GovernanceReviewAdminDeps,
): Promise<FeedbackListItem> {
  const classification = normalizeBadcaseTaxonomy(record.failureClassification);
  const item: FeedbackListItem = {
    id: record.id,
    entryId: record.entryId,
    entryType: record.entryType,
    entryShortcut: await entryShortcut(record, deps),
    problemType: record.problemType as FeedbackListItem['problemType'],
    description: record.description,
    context: record.context,
    submittedAt: record.submittedAt,
    submittedBy: {
      id: record.submittedByUserId,
      handle: record.submittedByHandle,
      securityLevel: 0,
    },
    status: record.status as FeedbackListItem['status'],
    ageDays: Math.round(ageDays(record.submittedAt, now)),
    adminNotes: record.adminNotes ?? null,
    ...(classification ? { failureClassification: classification } : {}),
  };
  return item;
}

export function createGovernanceReviewAdminModule(
  deps: GovernanceReviewAdminDeps,
): GovernanceReviewAdminModule {
  return {
    async list({ query }) {
      const filter = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.problemType ? { problemType: query.problemType } : {}),
        ...(query.entryId ? { entryId: query.entryId } : {}),
        ...(query.entryType ? { entryType: query.entryType } : {}),
      };
      const now = deps.now?.() ?? new Date();
      let records = (await deps.feedbackRepo.listByFilter(filter)) as AdminFeedbackRecord[];
      records = records.filter((record) => {
        const age = ageDays(record.submittedAt, now);
        return (
          (query.minAgeDays === undefined || age >= query.minAgeDays) &&
          (query.maxAgeDays === undefined || age <= query.maxAgeDays)
        );
      });
      const items = await Promise.all(records.map((record) => toFeedbackItem(record, now, deps)));
      items.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
      return feedbackListResponseSchema.parse({
        items: items.slice(0, query.limit),
        total: items.length,
      });
    },

    async stats({ entryId }) {
      const knowledgeEntry = await deps.knowledgeRead.getById(entryId);
      const artifact = knowledgeEntry ? null : await deps.artifactReadProjection.getById(entryId);
      if (!knowledgeEntry && !artifact) {
        throw InvocationError.notFound(`Entry not found: ${entryId}`);
      }

      const records = (await deps.feedbackRepo.listByEntry(entryId)) as AdminFeedbackRecord[];
      const now = deps.now?.() ?? new Date();
      const unresolvedFeedback = records.filter(
        (record) => record.status === 'new' || record.status === 'triaged',
      ).length;
      const outdatedReports = records.filter((record) => record.problemType === 'outdated').length;
      const incorrectReports = records.filter(
        (record) => record.problemType === 'incorrect',
      ).length;
      const lastFeedbackAt =
        records.length > 0
          ? records.reduce(
              (latest, record) => (record.submittedAt > latest ? record.submittedAt : latest),
              records[0]!.submittedAt,
            )
          : null;
      const score = qualityScore(unresolvedFeedback, incorrectReports, outdatedReports);
      const recentFeedback = await Promise.all(
        [...records]
          .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
          .slice(0, 10)
          .map((record) => toFeedbackItem(record, now, deps)),
      );

      return feedbackStatsResponseSchema.parse({
        entryId,
        entryType: knowledgeEntry ? 'trap' : 'skill',
        quality: {
          totalFeedback: records.length,
          unresolvedFeedback,
          outdatedReports,
          incorrectReports,
          qualityScore: score,
          lastFeedbackAt,
        },
        recentFeedback,
      });
    },

    async batch({ actorId, command }) {
      const records = new Map<string, AdminFeedbackRecord>();
      const items = command.feedbackIds.map(async (feedbackId) => {
        const record = (await deps.feedbackRepo.getById(feedbackId)) as AdminFeedbackRecord | null;
        if (record) records.set(feedbackId, record);
        const eligibility = batchActionEligibility(
          command.action,
          record,
          command.transitionTarget,
        );
        return {
          feedbackId,
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          transitionApplied: false,
        };
      });
      const resultItems = await Promise.all(items);
      const totalEligible = resultItems.filter((item) => item.eligible).length;
      const totalIneligible = resultItems.length - totalEligible;
      if (command.dryRun) {
        return feedbackBatchResponseSchema.parse({
          action: command.action,
          dryRun: true,
          items: resultItems,
          totalEligible,
          totalIneligible,
          appliedAt: null,
        });
      }

      const appliedAt = (deps.now?.() ?? new Date()).toISOString();
      for (const item of resultItems) {
        if (!item.eligible) continue;
        const updates: Record<string, unknown> = {
          ...batchActionUpdates(command.action, command.transitionTarget, appliedAt, actorId),
          updatedAt: appliedAt,
        };
        if (command.notes) updates.adminNotes = command.notes;
        if (command.action === 'transition') item.transitionApplied = true;
        await deps.feedbackRepo.update(item.feedbackId, updates);
      }
      const lifecycleTransitions: Array<{ entryId: string; toState: string; reason: string }> = [];
      if (deps.knowledgeWrite) {
        const affectedEntryIds = [
          ...new Set(
            resultItems
              .filter((item) => item.eligible)
              .map((item) => records.get(item.feedbackId)?.entryId)
              .filter((entryId): entryId is string => Boolean(entryId)),
          ),
        ];
        const now = deps.now?.() ?? new Date();
        for (const entryId of affectedEntryIds) {
          const entryRecords = (await deps.feedbackRepo.listByEntry(
            entryId,
          )) as AdminFeedbackRecord[];
          for (const rule of DEFAULT_LIFECYCLE_TRIGGER_RULES) {
            const matching = entryRecords.filter((record) =>
              matchesLifecycleTriggerRule(record, rule, now),
            );
            if (matching.length < rule.minCount) continue;
            const reason = `${matching.length} '${rule.problemType}' feedback in last ${rule.timeWindowDays} days`;
            await deps.knowledgeWrite.applyDecayDecision({
              entryId,
              actorId,
              action: rule.targetDecayState,
              note: reason,
            });
            lifecycleTransitions.push({ entryId, toState: rule.targetDecayState, reason });
            break;
          }
        }
      }
      await deps.auditLog?.record({
        action: 'feedback-batch',
        actorId,
        metadata: {
          action: command.action,
          feedbackCount: command.feedbackIds.length,
          eligibleCount: totalEligible,
          lifecycleTransitions,
        },
      });
      return feedbackBatchResponseSchema.parse({
        action: command.action,
        dryRun: false,
        items: resultItems,
        totalEligible,
        totalIneligible,
        appliedAt,
      });
    },

    async listRemediation() {
      const allFeedback = (await deps.feedbackRepo.listByFilter({})) as AdminFeedbackRecord[];
      const grouped = new Map<string, AdminFeedbackRecord[]>();
      for (const record of allFeedback) {
        const group = grouped.get(record.entryId) ?? [];
        group.push(record);
        grouped.set(record.entryId, group);
      }

      const now = deps.now?.() ?? new Date();
      const items: FeedbackRemediationQueueItem[] = [];
      for (const [entryId, records] of grouped) {
        const remediation = remediationState(records, entryId);
        if (!remediation) continue;
        const knowledgeEntry = await deps.knowledgeRead.getById(entryId);
        const artifact = knowledgeEntry ? null : await deps.artifactReadProjection.getById(entryId);
        if (!knowledgeEntry && !artifact) continue;
        const entryType = knowledgeEntry ? 'trap' : 'skill';
        const title = knowledgeEntry
          ? String((knowledgeEntry as { shortcut?: unknown }).shortcut ?? 'unknown')
          : String((artifact as { title?: unknown }).title ?? 'unknown');
        const recentFeedback = await Promise.all(
          [...records]
            .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
            .slice(0, 10)
            .map((record) => toFeedbackItem(record, now, deps)),
        );
        const sourceSnapshot = knowledgeEntry
          ? {
              trapDetail: String((knowledgeEntry as { detail?: unknown }).detail ?? ''),
            }
          : (() => {
              const latestRevision = artifact?.history.find(
                (r) => r.revision === artifact.latestRevision,
              );
              const derived = latestRevision?.derived;
              return {
                skillRevision: latestRevision?.revision ?? null,
                skillProfileSummary: derived?.profile?.summary ?? null,
                skillCapsules:
                  derived?.capsules?.map((capsule) => ({
                    capsuleId: capsule.capsuleId,
                    problem: capsule.problem,
                    content: capsule.content,
                  })) ?? [],
              };
            })();
        items.push({
          entryId,
          entryType,
          title,
          remediation,
          unresolvedFeedbackCount: activeFeedback(records, entryId).length,
          sourceSnapshot,
          recentFeedback,
        });
      }
      items.sort((left, right) =>
        (right.remediation.openedAt ?? '').localeCompare(left.remediation.openedAt ?? ''),
      );
      return feedbackRemediationQueueResponseSchema.parse({
        items,
        total: items.length,
        failureClassificationSummary: failureClassificationSummary(
          items.flatMap((item) => item.recentFeedback),
        ),
      });
    },

    async getRemediation({ actorId, entryId }) {
      const queue = await this.listRemediation({ actorId });
      const item = queue.items.find((candidate) => candidate.entryId === entryId);
      if (!item) {
        throw InvocationError.notFound(`Remediation item not found: ${entryId}`);
      }
      return feedbackRemediationDetailResponseSchema.parse({ item });
    },

    async completeRemediation({ actorId, entryId, command }) {
      const records = (await deps.feedbackRepo.listByEntry(entryId)) as AdminFeedbackRecord[];
      const unresolved = activeFeedback(records, entryId);
      if (unresolved.length < FEEDBACK_REMEDIATION_THRESHOLD) {
        throw InvocationError.conflict('Entry is not currently in remediation queue');
      }
      const resolvedAt = (deps.now?.() ?? new Date()).toISOString();
      for (const record of unresolved) {
        await deps.feedbackRepo.update(record.id, {
          status: 'resolved',
          adminNotes: command.notes,
          resolvedAt,
          resolvedByUserId: actorId,
          remediationStatus: 'ready-to-reindex',
          remediationResolvedAt: resolvedAt,
          remediationResolvedByUserId: actorId,
        });
      }
      if (!deps.jobRuntime) {
        throw InvocationError.unavailable('Job runtime is unavailable');
      }
      const payload = remediationReactivationPayloadSchema.parse({
        entryId,
        entryType: unresolved[0]!.entryType,
        feedbackIds: unresolved.map((record) => record.id),
        resolvedAt,
        resolvedByUserId: actorId,
        notes: command.notes,
      });
      const asyncJobId = await deps.jobRuntime.schedule(
        'feedback.remediation-reactivation',
        payload,
        { dedupeKey: `feedback.remediation-reactivation:${entryId}:${resolvedAt}` },
      );
      await deps.auditLog?.record({
        action: 'feedback-remediation.complete',
        actorId,
        entityId: entryId,
        metadata: { resolvedCount: unresolved.length, asyncJobId },
      });
      return feedbackRemediationCompleteResponseSchema.parse({
        entryId,
        entryType: unresolved[0]!.entryType,
        resolvedFeedbackIds: unresolved.map((record) => record.id),
        resolvedCount: unresolved.length,
        resolvedAt,
        asyncJobId,
      });
    },
  };
}
