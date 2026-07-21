import {
  InvocationError,
  type AuditLogPort,
  type FeedbackRepositoryPort,
  type GovernanceAsyncCommandPort,
} from '@trapmap/backend-core';
import {
  badcaseExportDraftPayloadSchema,
  remediationReactivationPayloadSchema,
  type BadcaseExportDraftPayload,
  type RemediationReactivationPayload,
} from '@trapmap/contracts';

type FeedbackRecord = NonNullable<Awaited<ReturnType<FeedbackRepositoryPort['getById']>>>;

export interface GovernanceAsyncCommandDeps {
  feedbackRepo: FeedbackRepositoryPort;
  auditLog?: AuditLogPort;
}

export type GovernanceAsyncCommandModule = GovernanceAsyncCommandPort;

function parseRemediationPayload(
  payload: RemediationReactivationPayload,
): RemediationReactivationPayload {
  try {
    return remediationReactivationPayloadSchema.parse(payload);
  } catch (error) {
    throw InvocationError.validation('Invalid remediation reactivation payload', error);
  }
}

function parseBadcasePayload(payload: BadcaseExportDraftPayload): BadcaseExportDraftPayload {
  try {
    return badcaseExportDraftPayloadSchema.parse(payload);
  } catch (error) {
    throw InvocationError.validation('Invalid badcase export draft payload', error);
  }
}

function assertRemediationFeedbackMatches(
  record: FeedbackRecord,
  payload: RemediationReactivationPayload,
): void {
  if (record.entryId !== payload.entryId || record.entryType !== payload.entryType) {
    throw InvocationError.conflict(
      `Feedback does not match remediation reactivation request: ${record.id}`,
    );
  }
}

function assertBadcaseFeedbackMatches(
  record: FeedbackRecord,
  payload: BadcaseExportDraftPayload,
): void {
  if (
    record.entryId !== payload.entryId ||
    record.entryType !== payload.entryType ||
    (record.queryId ?? null) !== payload.queryId
  ) {
    throw InvocationError.conflict(`Feedback does not match badcase export request: ${record.id}`);
  }
}

async function getFeedbackOrThrow(
  feedbackRepo: FeedbackRepositoryPort,
  feedbackId: string,
): Promise<FeedbackRecord> {
  const record = await feedbackRepo.getById(feedbackId);
  if (!record) {
    throw InvocationError.notFound(`Feedback not found: ${feedbackId}`);
  }
  return record;
}

export function createGovernanceAsyncCommandModule(
  deps: GovernanceAsyncCommandDeps,
): GovernanceAsyncCommandModule {
  return {
    async reactivateRemediation(input) {
      const payload = parseRemediationPayload(input);
      const records = await Promise.all(
        payload.feedbackIds.map((feedbackId) => getFeedbackOrThrow(deps.feedbackRepo, feedbackId)),
      );

      for (const record of records) {
        assertRemediationFeedbackMatches(record, payload);
      }

      for (const record of records) {
        await deps.feedbackRepo.update(record.id, {
          remediationStatus: null,
          updatedAt: new Date().toISOString(),
        });
      }

      await deps.auditLog?.record({
        action: 'feedback.remediation-reactivation',
        actorId: 'governance-review',
        entityId: payload.entryId,
        metadata: {
          entryId: payload.entryId,
          feedbackIds: payload.feedbackIds,
        },
      });
    },

    async exportBadcaseDraft(input) {
      const payload = parseBadcasePayload(input);
      const record = await getFeedbackOrThrow(deps.feedbackRepo, payload.feedbackId);
      assertBadcaseFeedbackMatches(record, payload);

      await deps.auditLog?.record({
        action: 'feedback.badcase-export-draft',
        actorId: 'governance-review',
        entityId: payload.feedbackId,
        metadata: {
          feedbackId: payload.feedbackId,
          entryId: payload.entryId,
          entryType: payload.entryType,
          queryId: payload.queryId,
          requestId: payload.requestId,
          traceId: payload.traceId,
        },
      });
    },
  };
}
