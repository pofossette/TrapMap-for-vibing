import { z } from 'zod';

import {
  actorRefSchema,
  entityIdSchema,
  isoTimestampSchema,
  lifecycleStateSchema,
  sha256HexSchema,
} from './common.js';
import { feedbackStatusSchema } from './feedback.js';

export const asyncEventNameSchema = z.enum([
  'KnowledgeApproved',
  'KnowledgeRejected',
  'KnowledgeSuperseded',
  'TrapActivated',
  'TrapDeactivated',
  'ArtifactIndexed',
  'FeedbackRemediationTriggered',
  'ReadModelRefreshRequested',
]);

export const asyncJobTaskTypeSchema = z.enum([
  'candidate_processing',
  'knowledge.index-follow-up',
  'skill.index-follow-up',
  'feedback.remediation-reactivation',
  'feedback.badcase-export-draft',
  'governance.conflict-detection',
]);

export const asyncContractOrderingRequirementSchema = z.enum([
  'global-none',
  'per-subject-sequential',
  'per-artifact-revision',
  'per-transition',
]);

export const asyncRetryDeadLetterPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1),
    backoff: z.enum(['exponential', 'fixed']),
    deadLetterStepName: z.literal('dead-letter'),
    deadLetterMeaning: z.string().min(1).max(1000),
    operatorAction: z.string().min(1).max(1000),
  })
  .strict();

export const asyncContractPublisherContextSchema = z
  .object({
    boundedContext: z.enum([
      'knowledge-review',
      'knowledge-lifecycle',
      'artifact-indexing',
      'candidate-ingestion',
      'feedback-remediation',
      'read-models',
    ]),
    service: z.string().min(1).max(120),
    trigger: z.string().min(1).max(280),
    owner: z.enum([
      'knowledge-entry',
      'skill-artifact',
      'candidate-submission',
      'feedback-record',
      'read-model',
    ]),
  })
  .strict();

export const asyncIdempotencyKeySchema = z
  .object({
    description: z.string().min(1).max(500),
    format: z.string().min(1).max(280),
  })
  .strict();

export const asyncDownstreamConsumerSchema = z
  .object({
    name: z.string().min(1).max(120),
    purpose: z.string().min(1).max(280),
  })
  .strict();

export const asyncEventMetadataSchema = z
  .object({
    publisher: asyncContractPublisherContextSchema,
    idempotencyKey: asyncIdempotencyKeySchema,
    ordering: asyncContractOrderingRequirementSchema,
    retryPolicy: asyncRetryDeadLetterPolicySchema,
    downstreamConsumers: z.array(asyncDownstreamConsumerSchema).min(1),
    crossesServiceBoundaryLater: z.boolean(),
  })
  .strict();

const asyncTriggeringEventNameSchema = z.enum([
  'KnowledgeApproved',
  'KnowledgeRejected',
  'KnowledgeSuperseded',
  'TrapActivated',
  'TrapDeactivated',
  'FeedbackRemediationTriggered',
  'ReadModelRefreshRequested',
]);

export const readModelProjectionSchema = z.enum([
  'knowledge-search',
  'skill-search',
  'review-queue',
  'feedback-queue',
  'operations-dashboard',
]);

export const readModelRefreshCauseSchema = z.enum([
  'knowledge-approved',
  'knowledge-rejected',
  'knowledge-superseded',
  'trap-activation-changed',
  'artifact-indexed',
  'candidate-resolved',
  'feedback-remediation-triggered',
]);

export const knowledgeApprovedEventPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    submissionId: entityIdSchema,
    revision: z.number().int().min(1),
    approvedAt: isoTimestampSchema,
    approvedBy: actorRefSchema,
    lifecycleState: z.literal('approved'),
  })
  .strict();

export const knowledgeRejectedEventPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    submissionId: entityIdSchema,
    revision: z.number().int().min(1),
    rejectedAt: isoTimestampSchema,
    rejectedBy: actorRefSchema,
    lifecycleState: z.literal('rejected'),
    reason: z.string().min(1).max(2000),
  })
  .strict();

export const knowledgeSupersededEventPayloadSchema = z
  .object({
    supersededEntryId: entityIdSchema,
    supersedingEntryId: entityIdSchema,
    supersededRevision: z.number().int().min(1),
    supersedingRevision: z.number().int().min(1),
    supersededAt: isoTimestampSchema,
    supersededBy: actorRefSchema.nullable(),
    reason: z.string().min(1).max(1000),
  })
  .strict();

export const trapActivatedEventPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    revision: z.number().int().min(1),
    activatedAt: isoTimestampSchema,
    activatedBy: actorRefSchema.nullable(),
    previousState: lifecycleStateSchema,
    nextState: z.literal('approved'),
    reason: z.string().min(1).max(280),
  })
  .strict();

export const trapDeactivatedEventPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    revision: z.number().int().min(1),
    deactivatedAt: isoTimestampSchema,
    deactivatedBy: actorRefSchema.nullable(),
    previousState: lifecycleStateSchema,
    nextState: z.literal('deactivated'),
    reason: z.string().min(1).max(280),
  })
  .strict();

export const artifactIndexedEventPayloadSchema = z
  .object({
    artifactId: entityIdSchema,
    revision: z.number().int().min(1),
    sourceHash: sha256HexSchema,
    indexedAt: isoTimestampSchema,
    indexTargets: z.array(z.enum(['profile', 'capsules', 'client-manifest'])).min(1),
    triggeredByEvent: asyncTriggeringEventNameSchema,
  })
  .strict();

export const feedbackRemediationTriggeredEventPayloadSchema = z
  .object({
    feedbackId: entityIdSchema,
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    status: feedbackStatusSchema,
    triggeredAt: isoTimestampSchema,
    triggeredBy: actorRefSchema.nullable(),
    activeFeedbackCount: z.number().int().min(1),
    suppression: z.object({
      retrieval: z.boolean(),
      indexing: z.boolean(),
    }),
  })
  .strict();

export const readModelRefreshRequestedEventPayloadSchema = z
  .object({
    requestId: entityIdSchema,
    subjectType: z.enum(['trap', 'skill', 'candidate', 'feedback']),
    subjectId: entityIdSchema,
    projection: readModelProjectionSchema,
    cause: readModelRefreshCauseSchema,
    requestedAt: isoTimestampSchema,
    requestedBy: actorRefSchema.nullable(),
  })
  .strict();

export const asyncEventPayloadSchemaMap = {
  KnowledgeApproved: knowledgeApprovedEventPayloadSchema,
  KnowledgeRejected: knowledgeRejectedEventPayloadSchema,
  KnowledgeSuperseded: knowledgeSupersededEventPayloadSchema,
  TrapActivated: trapActivatedEventPayloadSchema,
  TrapDeactivated: trapDeactivatedEventPayloadSchema,
  ArtifactIndexed: artifactIndexedEventPayloadSchema,
  FeedbackRemediationTriggered: feedbackRemediationTriggeredEventPayloadSchema,
  ReadModelRefreshRequested: readModelRefreshRequestedEventPayloadSchema,
} satisfies Record<z.infer<typeof asyncEventNameSchema>, z.ZodTypeAny>;

export const candidateProcessingPayloadSchema = z
  .object({
    candidateId: entityIdSchema,
    retryCount: z.number().int().min(0),
  })
  .strict();

export const knowledgeIndexFollowUpPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    previousState: lifecycleStateSchema,
    nextState: lifecycleStateSchema,
    reason: z.string().min(1).max(280),
  })
  .strict();

export const remediationReactivationPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    feedbackIds: z.array(entityIdSchema).min(1),
    resolvedAt: isoTimestampSchema,
    resolvedByUserId: entityIdSchema.nullable(),
    notes: z.string().max(1000).nullable(),
  })
  .strict();

export const skillIndexFollowUpPayloadSchema = z
  .object({
    artifactId: entityIdSchema,
    previousState: lifecycleStateSchema,
    nextState: lifecycleStateSchema,
    reason: z.string().min(1).max(280),
  })
  .strict();

export const badcaseExportDraftPayloadSchema = z
  .object({
    feedbackId: entityIdSchema,
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    queryId: z.string().min(1).nullable(),
  })
  .strict();

export const governanceConflictDetectionPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    sourceEventId: entityIdSchema,
  })
  .strict();

export const sharedJobPayloadSchemaMap = {
  candidate_processing: candidateProcessingPayloadSchema,
  'knowledge.index-follow-up': knowledgeIndexFollowUpPayloadSchema,
  'skill.index-follow-up': skillIndexFollowUpPayloadSchema,
  'feedback.remediation-reactivation': remediationReactivationPayloadSchema,
  'feedback.badcase-export-draft': badcaseExportDraftPayloadSchema,
  'governance.conflict-detection': governanceConflictDetectionPayloadSchema,
} satisfies Record<z.infer<typeof asyncJobTaskTypeSchema>, z.ZodTypeAny>;

export const asyncEventContractSchema = z
  .object({
    eventName: asyncEventNameSchema,
    payloadSchema: z.custom<z.ZodTypeAny>((value) => value instanceof z.ZodType, {
      message: 'payloadSchema must be a Zod schema',
    }),
    metadata: asyncEventMetadataSchema,
  })
  .strict();

export const sharedJobContractSchema = z
  .object({
    taskType: asyncJobTaskTypeSchema,
    payloadSchema: z.custom<z.ZodTypeAny>((value) => value instanceof z.ZodType, {
      message: 'payloadSchema must be a Zod schema',
    }),
    owner: z
      .object({
        owner: z.enum([
          'candidate-submission',
          'knowledge-entry',
          'feedback-remediation',
          'skill-artifact',
          'feedback-badcase',
          'conflict-relation',
        ]),
        subjectIdField: z.string().min(1).max(120),
        subjectType: z.enum([
          'candidate',
          'trap',
          'skill',
          'feedback',
          'trap-or-skill',
          'knowledge-entry',
        ]),
      })
      .strict(),
    idempotencyKey: asyncIdempotencyKeySchema,
    payloadDescription: z.string().min(1).max(500),
    ordering: asyncContractOrderingRequirementSchema,
    retryPolicy: asyncRetryDeadLetterPolicySchema,
    downstreamConsumers: z.array(asyncDownstreamConsumerSchema).min(1),
    crossesServiceBoundaryLater: z.boolean(),
  })
  .strict();

function defineAsyncEventContract<TEventName extends AsyncEventName>(
  contract: AsyncEventContract<TEventName>,
): AsyncEventContract<TEventName> {
  return contract;
}

function defineSharedJobContract<TTaskType extends AsyncJobTaskType>(
  contract: SharedJobContract<TTaskType>,
): SharedJobContract<TTaskType> {
  return contract;
}

export const asyncEventContracts = {
  KnowledgeApproved: defineAsyncEventContract({
    eventName: 'KnowledgeApproved',
    payloadSchema: knowledgeApprovedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'knowledge-review',
        service: 'server.review',
        trigger: 'Reviewer approves a submitted knowledge revision',
        owner: 'knowledge-entry',
      },
      idempotencyKey: {
        description: 'One approval event per entry revision and submission decision.',
        format: 'KnowledgeApproved:<entryId>:<revision>:<submissionId>',
      },
      ordering: 'per-subject-sequential',
      retryPolicy: {
        maxAttempts: 5,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Approval propagation exhausted retries and downstream search/read models may remain stale.',
        operatorAction:
          'Inspect the approval outbox record, repair downstream consumer failures, and replay the event if the approval is still canonical.',
      },
      downstreamConsumers: [
        { name: 'knowledge-index-follow-up', purpose: 'Queue knowledge reindexing workflow' },
        { name: 'review-analytics', purpose: 'Track approval throughput and latency' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  KnowledgeRejected: defineAsyncEventContract({
    eventName: 'KnowledgeRejected',
    payloadSchema: knowledgeRejectedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'knowledge-review',
        service: 'server.review',
        trigger: 'Reviewer rejects a submitted knowledge revision',
        owner: 'knowledge-entry',
      },
      idempotencyKey: {
        description: 'One rejection event per entry revision and submission decision.',
        format: 'KnowledgeRejected:<entryId>:<revision>:<submissionId>',
      },
      ordering: 'per-subject-sequential',
      retryPolicy: {
        maxAttempts: 3,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Rejection propagation exhausted retries and moderation/read-model views may not reflect the latest decision.',
        operatorAction:
          'Review the failed publication, verify the rejection still stands, and replay after fixing the consumer or outbox issue.',
      },
      downstreamConsumers: [
        {
          name: 'review-queue-projection',
          purpose: 'Remove rejected revision from pending review',
        },
        { name: 'audit-log', purpose: 'Persist review decision history' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  KnowledgeSuperseded: defineAsyncEventContract({
    eventName: 'KnowledgeSuperseded',
    payloadSchema: knowledgeSupersededEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'knowledge-lifecycle',
        service: 'server.knowledge',
        trigger: 'A newer approved entry supersedes an existing canonical entry',
        owner: 'knowledge-entry',
      },
      idempotencyKey: {
        description: 'One supersession event per superseded/superseding revision pair.',
        format:
          'KnowledgeSuperseded:<supersededEntryId>:<supersededRevision>:<supersedingEntryId>:<supersedingRevision>',
      },
      ordering: 'per-subject-sequential',
      retryPolicy: {
        maxAttempts: 5,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Supersession propagation exhausted retries and consumers may continue serving stale canonical lineage.',
        operatorAction:
          'Repair lineage/index consumers, then replay the supersession event so stale projections can converge.',
      },
      downstreamConsumers: [
        { name: 'lineage-projection', purpose: 'Record superseded-to-superseding mapping' },
        { name: 'search-read-model', purpose: 'Demote superseded entry in retrieval' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  TrapActivated: defineAsyncEventContract({
    eventName: 'TrapActivated',
    payloadSchema: trapActivatedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'knowledge-lifecycle',
        service: 'server.knowledge',
        trigger: 'A trap becomes active for retrieval after approval or remediation',
        owner: 'knowledge-entry',
      },
      idempotencyKey: {
        description: 'One activation event per entry revision and state transition reason.',
        format: 'TrapActivated:<entryId>:<revision>:<reason>',
      },
      ordering: 'per-transition',
      retryPolicy: {
        maxAttempts: 3,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Activation follow-up exhausted retries and retrieval projections may remain out of sync with lifecycle state.',
        operatorAction:
          'Inspect activation transition logs, fix projection/indexing failures, and requeue activation if the entry should still be active.',
      },
      downstreamConsumers: [
        { name: 'knowledge-index-follow-up', purpose: 'Refresh retrieval-facing index state' },
        { name: 'activation-audit', purpose: 'Track activation transitions for operators' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  TrapDeactivated: defineAsyncEventContract({
    eventName: 'TrapDeactivated',
    payloadSchema: trapDeactivatedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'knowledge-lifecycle',
        service: 'server.knowledge',
        trigger: 'A trap is deactivated and should no longer appear in active retrieval paths',
        owner: 'knowledge-entry',
      },
      idempotencyKey: {
        description: 'One deactivation event per entry revision and state transition reason.',
        format: 'TrapDeactivated:<entryId>:<revision>:<reason>',
      },
      ordering: 'per-transition',
      retryPolicy: {
        maxAttempts: 3,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Deactivation propagation exhausted retries and stale retrieval/index artifacts may still expose the trap.',
        operatorAction:
          'Remove or suppress stale projections, then replay the deactivation event if the trap must remain inactive.',
      },
      downstreamConsumers: [
        {
          name: 'knowledge-index-follow-up',
          purpose: 'Remove or suppress trap from retrieval index',
        },
        { name: 'governance-monitor', purpose: 'Audit inactive content suppression' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  ArtifactIndexed: defineAsyncEventContract({
    eventName: 'ArtifactIndexed',
    payloadSchema: artifactIndexedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'artifact-indexing',
        service: 'server.artifacts',
        trigger: 'A skill artifact revision finishes derivation and indexing',
        owner: 'skill-artifact',
      },
      idempotencyKey: {
        description: 'One artifact indexed event per artifact revision and source hash.',
        format: 'ArtifactIndexed:<artifactId>:<revision>:<sourceHash>',
      },
      ordering: 'per-artifact-revision',
      retryPolicy: {
        maxAttempts: 5,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Artifact indexing completion exhausted retries and downstream search/profile projections may stay stale.',
        operatorAction:
          'Inspect derivation/index workflow output, repair indexing failures, and replay the completion event for the affected artifact revision.',
      },
      downstreamConsumers: [
        { name: 'skill-search-read-model', purpose: 'Expose new profile/capsules to retrieval' },
        {
          name: 'artifact-operations-dashboard',
          purpose: 'Report indexing completion to operators',
        },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  FeedbackRemediationTriggered: defineAsyncEventContract({
    eventName: 'FeedbackRemediationTriggered',
    payloadSchema: feedbackRemediationTriggeredEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'feedback-remediation',
        service: 'server.feedback',
        trigger: 'Feedback thresholds open a remediation workflow for a trap or skill',
        owner: 'feedback-record',
      },
      idempotencyKey: {
        description:
          'One remediation-trigger event per feedback record and active suppression opening.',
        format: 'FeedbackRemediationTriggered:<feedbackId>:<entryId>:<triggeredAt>',
      },
      ordering: 'per-subject-sequential',
      retryPolicy: {
        maxAttempts: 5,
        backoff: 'exponential',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Remediation trigger propagation exhausted retries and suppression/reactivation workflows may not run consistently.',
        operatorAction:
          'Check remediation state and failed tasks, repair the workflow trigger, then replay if the entry still requires remediation.',
      },
      downstreamConsumers: [
        {
          name: 'feedback-remediation-workflow',
          purpose: 'Open remediation tracking and suppression',
        },
        { name: 'read-model-refresh', purpose: 'Refresh feedback and retrieval suppression views' },
      ],
      crossesServiceBoundaryLater: true,
    },
  }),
  ReadModelRefreshRequested: defineAsyncEventContract({
    eventName: 'ReadModelRefreshRequested',
    payloadSchema: readModelRefreshRequestedEventPayloadSchema,
    metadata: {
      publisher: {
        boundedContext: 'read-models',
        service: 'server.read-models',
        trigger: 'A domain transition requests asynchronous refresh of one projection',
        owner: 'read-model',
      },
      idempotencyKey: {
        description: 'One refresh request per projection, subject, and originating request id.',
        format: 'ReadModelRefreshRequested:<projection>:<subjectType>:<subjectId>:<requestId>',
      },
      ordering: 'per-subject-sequential',
      retryPolicy: {
        maxAttempts: 5,
        backoff: 'fixed',
        deadLetterStepName: 'dead-letter',
        deadLetterMeaning:
          'Projection refresh exhausted retries and operational/query views may remain stale until manually replayed.',
        operatorAction:
          'Inspect the affected projection, repair the updater, and replay the refresh request once the projection can converge.',
      },
      downstreamConsumers: [
        { name: 'projection-workers', purpose: 'Refresh the addressed read model' },
        { name: 'operations-dashboard', purpose: 'Expose refresh backlog and failures' },
      ],
      crossesServiceBoundaryLater: false,
    },
  }),
} satisfies { [TEventName in AsyncEventName]: AsyncEventContract<TEventName> };

export const sharedJobContracts = {
  candidate_processing: defineSharedJobContract({
    taskType: 'candidate_processing',
    payloadSchema: candidateProcessingPayloadSchema,
    owner: {
      owner: 'candidate-submission',
      subjectIdField: 'candidateId',
      subjectType: 'candidate',
    },
    idempotencyKey: {
      description:
        'One candidate-processing task per candidate while work is pending or running; retries reuse the same durable work item.',
      format: 'candidate_processing:<candidateId>',
    },
    payloadDescription:
      'Candidate ingestion follow-up payload that advances one durable candidate through duplicate analysis and review readiness.',
    ordering: 'per-subject-sequential',
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'Candidate processing exhausted retries and the candidate remains outside duplicate-detected or review-ready states.',
      operatorAction:
        'Inspect the candidate workflow run and queue dead letter, repair duplicate-analysis failures, then requeue if the candidate is still actionable.',
    },
    downstreamConsumers: [
      {
        name: 'candidate-processing-worker',
        purpose: 'Run duplicate analysis and status transitions',
      },
      { name: 'workflow-audit', purpose: 'Track candidate ingestion progress and dead letters' },
    ],
    crossesServiceBoundaryLater: false,
  }),
  'knowledge.index-follow-up': defineSharedJobContract({
    taskType: 'knowledge.index-follow-up',
    payloadSchema: knowledgeIndexFollowUpPayloadSchema,
    owner: {
      owner: 'knowledge-entry',
      subjectIdField: 'entryId',
      subjectType: 'trap',
    },
    idempotencyKey: {
      description:
        'One follow-up per knowledge lifecycle transition and reason combination while work is pending or running.',
      format: 'knowledge.index-follow-up:<entryId>:<previousState>:<nextState>:<reason>',
    },
    payloadDescription:
      'Lifecycle transition payload for reindexing one knowledge entry after approval, deactivation, or approved-content updates.',
    ordering: 'per-transition',
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'Index synchronization for the knowledge entry did not complete after all retries and workflow state is failed.',
      operatorAction:
        'Inspect workflow run and queue dead letter, fix the indexing failure, then requeue if the transition still applies.',
    },
    downstreamConsumers: [
      { name: 'knowledge-index-worker', purpose: 'Update trap retrieval projections' },
      { name: 'workflow-audit', purpose: 'Track asynchronous follow-up completion' },
    ],
    crossesServiceBoundaryLater: false,
  }),
  'skill.index-follow-up': defineSharedJobContract({
    taskType: 'skill.index-follow-up',
    payloadSchema: skillIndexFollowUpPayloadSchema,
    owner: {
      owner: 'skill-artifact',
      subjectIdField: 'artifactId',
      subjectType: 'skill',
    },
    idempotencyKey: {
      description:
        'One follow-up per skill lifecycle transition and reason combination while work is pending or running.',
      format: 'skill.index-follow-up:<artifactId>:<previousState>:<nextState>:<reason>',
    },
    payloadDescription:
      'Lifecycle transition payload for refreshing one skill artifact projection after approval, deactivation, or approved-content updates.',
    ordering: 'per-transition',
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'Skill projection refresh did not complete after all retries and retrieval/operator views may stay stale.',
      operatorAction:
        'Inspect workflow run and queue dead letter, repair the underlying skill indexing failure, then requeue if the transition still applies.',
    },
    downstreamConsumers: [
      { name: 'skill-index-worker', purpose: 'Update skill retrieval projections' },
      { name: 'workflow-audit', purpose: 'Track asynchronous follow-up completion' },
    ],
    crossesServiceBoundaryLater: false,
  }),
  'feedback.remediation-reactivation': defineSharedJobContract({
    taskType: 'feedback.remediation-reactivation',
    payloadSchema: remediationReactivationPayloadSchema,
    owner: {
      owner: 'feedback-remediation',
      subjectIdField: 'entryId',
      subjectType: 'trap-or-skill',
    },
    idempotencyKey: {
      description:
        'One remediation reactivation per entry and remediation completion timestamp while work is pending or running.',
      format: 'feedback.remediation-reactivation:<entryId>:<resolvedAt>',
    },
    payloadDescription:
      'Resolved feedback bundle that reactivates one trap or skill entry after remediation and refreshes its index state.',
    ordering: 'per-subject-sequential',
    retryPolicy: {
      maxAttempts: 5,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'Remediation was marked complete, but reactivation/index refresh never finished after retries; the entry may remain stale.',
      operatorAction:
        'Review the remediation workflow run, verify the target entry still exists, resolve indexing errors, then requeue if reactivation is still required.',
    },
    downstreamConsumers: [
      { name: 'remediation-reactivation-worker', purpose: 'Restore active retrieval/index state' },
      { name: 'workflow-audit', purpose: 'Track remediation reactivation completion' },
    ],
    crossesServiceBoundaryLater: false,
  }),
  'feedback.badcase-export-draft': defineSharedJobContract({
    taskType: 'feedback.badcase-export-draft',
    payloadSchema: badcaseExportDraftPayloadSchema,
    owner: {
      owner: 'feedback-badcase',
      subjectIdField: 'feedbackId',
      subjectType: 'feedback',
    },
    idempotencyKey: {
      description: 'One export-draft task per feedback record while work is pending or running.',
      format: 'feedback.badcase-export-draft:<feedbackId>',
    },
    payloadDescription:
      'Feedback-derived badcase export draft request bound to one feedback record and its originating entry/query context.',
    ordering: 'per-subject-sequential',
    retryPolicy: {
      maxAttempts: 3,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'The badcase draft export follow-up did not finalize after retries and async export bookkeeping remains incomplete.',
      operatorAction:
        'Check the queue dead letter and related feedback trace, fix the export/storage issue, then requeue if the draft is still needed.',
    },
    downstreamConsumers: [
      { name: 'badcase-export-worker', purpose: 'Generate eval draft artifact from feedback' },
      { name: 'workflow-audit', purpose: 'Track badcase draft export completion' },
    ],
    crossesServiceBoundaryLater: false,
  }),
  'governance.conflict-detection': defineSharedJobContract({
    taskType: 'governance.conflict-detection',
    payloadSchema: governanceConflictDetectionPayloadSchema,
    owner: {
      owner: 'conflict-relation',
      subjectIdField: 'entryId',
      subjectType: 'knowledge-entry',
    },
    idempotencyKey: {
      description:
        'One conflict detection task per approved entry and source event; duplicate delivery is safe.',
      format: 'governance.conflict-detection:<entryId>:<sourceEventId>',
    },
    payloadDescription:
      'Governance-owned conflict detection input for one approved knowledge entry.',
    ordering: 'per-transition',
    retryPolicy: {
      maxAttempts: 5,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
      deadLetterMeaning:
        'Conflict detection exhausted retries and the governance conflict projection may be stale.',
      operatorAction:
        'Inspect the governance workflow and queue dead letter, repair the dependency, then replay the task.',
    },
    downstreamConsumers: [
      {
        name: 'governance-review-conflict-worker',
        purpose: 'Detect and persist canonical conflict relations',
      },
      {
        name: 'knowledge-read-projection',
        purpose: 'Expose conflict hints to retrieval after owner projection convergence',
      },
    ],
    crossesServiceBoundaryLater: true,
  }),
} satisfies { [TTaskType in AsyncJobTaskType]: SharedJobContract<TTaskType> };

export function getAsyncEventContract<TEventName extends AsyncEventName>(
  eventName: TEventName,
): AsyncEventContract<TEventName> {
  return asyncEventContracts[eventName] as AsyncEventContract<TEventName>;
}

export function getSharedJobContract<TTaskType extends AsyncJobTaskType>(
  taskType: TTaskType,
): SharedJobContract<TTaskType> {
  return sharedJobContracts[taskType] as SharedJobContract<TTaskType>;
}

export type AsyncEventName = z.infer<typeof asyncEventNameSchema>;
export type AsyncJobTaskType = z.infer<typeof asyncJobTaskTypeSchema>;
export type AsyncContractOrderingRequirement = z.infer<
  typeof asyncContractOrderingRequirementSchema
>;
export type AsyncRetryDeadLetterPolicy = z.infer<typeof asyncRetryDeadLetterPolicySchema>;
export type AsyncContractPublisherContext = z.infer<typeof asyncContractPublisherContextSchema>;
export type AsyncIdempotencyKey = z.infer<typeof asyncIdempotencyKeySchema>;
export type AsyncDownstreamConsumer = z.infer<typeof asyncDownstreamConsumerSchema>;
export type AsyncEventMetadata = z.infer<typeof asyncEventMetadataSchema>;
export type ReadModelProjection = z.infer<typeof readModelProjectionSchema>;
export type ReadModelRefreshCause = z.infer<typeof readModelRefreshCauseSchema>;
export type KnowledgeApprovedEventPayload = z.infer<typeof knowledgeApprovedEventPayloadSchema>;
export type KnowledgeRejectedEventPayload = z.infer<typeof knowledgeRejectedEventPayloadSchema>;
export type KnowledgeSupersededEventPayload = z.infer<typeof knowledgeSupersededEventPayloadSchema>;
export type TrapActivatedEventPayload = z.infer<typeof trapActivatedEventPayloadSchema>;
export type TrapDeactivatedEventPayload = z.infer<typeof trapDeactivatedEventPayloadSchema>;
export type ArtifactIndexedEventPayload = z.infer<typeof artifactIndexedEventPayloadSchema>;
export type FeedbackRemediationTriggeredEventPayload = z.infer<
  typeof feedbackRemediationTriggeredEventPayloadSchema
>;
export type ReadModelRefreshRequestedEventPayload = z.infer<
  typeof readModelRefreshRequestedEventPayloadSchema
>;
export type CandidateProcessingPayload = z.infer<typeof candidateProcessingPayloadSchema>;
export type KnowledgeIndexFollowUpPayload = z.infer<typeof knowledgeIndexFollowUpPayloadSchema>;
export type RemediationReactivationPayload = z.infer<typeof remediationReactivationPayloadSchema>;
export type SkillIndexFollowUpPayload = z.infer<typeof skillIndexFollowUpPayloadSchema>;
export type BadcaseExportDraftPayload = z.infer<typeof badcaseExportDraftPayloadSchema>;
export type GovernanceConflictDetectionPayload = z.infer<
  typeof governanceConflictDetectionPayloadSchema
>;
export type AsyncEventContract<TEventName extends AsyncEventName = AsyncEventName> = {
  eventName: TEventName;
  payloadSchema: (typeof asyncEventPayloadSchemaMap)[TEventName];
  metadata: AsyncEventMetadata;
};
export type SharedJobContract<TTaskType extends AsyncJobTaskType = AsyncJobTaskType> = {
  taskType: TTaskType;
  payloadSchema: (typeof sharedJobPayloadSchemaMap)[TTaskType];
  owner: z.infer<typeof sharedJobContractSchema>['owner'];
  idempotencyKey: AsyncIdempotencyKey;
  payloadDescription: string;
  ordering: AsyncContractOrderingRequirement;
  retryPolicy: AsyncRetryDeadLetterPolicy;
  downstreamConsumers: AsyncDownstreamConsumer[];
  crossesServiceBoundaryLater: boolean;
};
