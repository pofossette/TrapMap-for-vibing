import type { LifecycleState } from '@trapmap/contracts';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
import type { WorkflowType } from '@trapmap/server/lib/workflows/types.js';

export const KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE = 'knowledge.index-follow-up';
export const SKILL_INDEX_FOLLOW_UP_TASK_TYPE = 'skill.index-follow-up';
export const REMEDIATION_REACTIVATION_TASK_TYPE = 'feedback.remediation-reactivation';
export const BADCASE_EXPORT_DRAFT_TASK_TYPE = 'feedback.badcase-export-draft';

export type SharedJobTaskType =
  | typeof KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE
  | typeof SKILL_INDEX_FOLLOW_UP_TASK_TYPE
  | typeof REMEDIATION_REACTIVATION_TASK_TYPE
  | typeof BADCASE_EXPORT_DRAFT_TASK_TYPE;

export interface KnowledgeIndexFollowUpPayload {
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
}

export interface RemediationReactivationPayload {
  entryId: string;
  entryType: 'trap' | 'skill';
  feedbackIds: string[];
  resolvedAt: string;
  resolvedByUserId: string | null;
  notes: string | null;
}

export interface SkillIndexFollowUpPayload {
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
}

export interface BadcaseExportDraftPayload {
  feedbackId: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  queryId: string | null;
}

export type SharedJobPayloadByType = {
  [KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE]: KnowledgeIndexFollowUpPayload;
  [SKILL_INDEX_FOLLOW_UP_TASK_TYPE]: SkillIndexFollowUpPayload;
  [REMEDIATION_REACTIVATION_TASK_TYPE]: RemediationReactivationPayload;
  [BADCASE_EXPORT_DRAFT_TASK_TYPE]: BadcaseExportDraftPayload;
};

export type SharedJobOwnerContext =
  | {
      owner: 'knowledge-entry';
      subjectId: string;
      subjectType: 'trap';
    }
  | {
      owner: 'feedback-remediation';
      subjectId: string;
      subjectType: 'trap' | 'skill';
    }
  | {
      owner: 'skill-artifact';
      subjectId: string;
      subjectType: 'skill';
    }
  | {
      owner: 'feedback-badcase';
      subjectId: string;
      subjectType: 'feedback';
    };

export interface SharedJobWorkflowBinding<TPayload> {
  workflowType: WorkflowType;
  runId: (payload: TPayload) => string;
  subjectId: (payload: TPayload) => string;
}

export interface SharedJobContract<TTaskType extends SharedJobTaskType> {
  taskType: TTaskType;
  owner: (payload: SharedJobPayloadByType[TTaskType]) => SharedJobOwnerContext;
  idempotencyKey: {
    description: string;
    format: string;
  };
  payloadDescription: string;
  maxAttempts: number;
  deadLetter: {
    stepName: 'dead-letter';
    meaning: string;
    operatorAction: string;
  };
  workflow: SharedJobWorkflowBinding<SharedJobPayloadByType[TTaskType]>;
}

function workflowRunIdForKnowledgeIndexFollowUp(
  payload: KnowledgeIndexFollowUpPayload,
): string {
  return [
    'wf',
    'knowledge_index',
    payload.entryId,
    payload.previousState,
    payload.nextState,
    payload.reason,
  ]
    .map((part) => part.replace(/[^a-zA-Z0-9_-]+/g, '_'))
    .join('_');
}

function workflowRunIdForRemediationReactivation(
  payload: RemediationReactivationPayload,
): string {
  return ['wf', 'remediation', payload.entryId, payload.resolvedAt]
    .map((part) => part.replace(/[^a-zA-Z0-9_-]+/g, '_'))
    .join('_');
}

function workflowRunIdForSkillIndexFollowUp(payload: SkillIndexFollowUpPayload): string {
  return [
    'wf',
    'skill_index',
    payload.artifactId,
    payload.previousState,
    payload.nextState,
    payload.reason,
  ]
    .map((part) => part.replace(/[^a-zA-Z0-9_-]+/g, '_'))
    .join('_');
}

function workflowRunIdForBadcaseExportDraft(payload: BadcaseExportDraftPayload): string {
  return `wf_badcase_${payload.feedbackId}`;
}

export const sharedJobContracts = {
  [KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE]: {
    taskType: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
    owner: (payload: KnowledgeIndexFollowUpPayload) => ({
      owner: 'knowledge-entry',
      subjectId: payload.entryId,
      subjectType: 'trap',
    }),
    idempotencyKey: {
      description:
        'One follow-up per knowledge lifecycle transition and reason combination while work is pending/running.',
      format:
        'knowledge.index-follow-up:<entryId>:<previousState>:<nextState>:<reason>',
    },
    payloadDescription:
      'Lifecycle transition payload for reindexing one knowledge entry after approval, deactivation, or approved-content updates.',
    maxAttempts: 3,
    deadLetter: {
      stepName: 'dead-letter',
      meaning:
        'Index synchronization for the knowledge entry did not complete after all retries; workflow state is marked failed.',
      operatorAction:
        'Inspect workflow run and queue dead letter, fix the underlying indexing failure, then requeue if the transition still applies.',
    },
    workflow: {
      workflowType: 'knowledge-index-follow-up',
      runId: workflowRunIdForKnowledgeIndexFollowUp,
      subjectId: (payload: KnowledgeIndexFollowUpPayload) => payload.entryId,
    },
  },
  [REMEDIATION_REACTIVATION_TASK_TYPE]: {
    taskType: REMEDIATION_REACTIVATION_TASK_TYPE,
    owner: (payload: RemediationReactivationPayload) => ({
      owner: 'feedback-remediation',
      subjectId: payload.entryId,
      subjectType: payload.entryType,
    }),
    idempotencyKey: {
      description:
        'One remediation reactivation per entry and remediation completion timestamp while work is pending/running.',
      format:
        'feedback.remediation-reactivation:<entryId>:<resolvedAt>',
    },
    payloadDescription:
      'Resolved feedback bundle that reactivates one trap or skill entry after remediation and refreshes its index state.',
    maxAttempts: 5,
    deadLetter: {
      stepName: 'dead-letter',
      meaning:
        'Remediation was marked complete, but reactivation/index refresh never finished after retries; the entry may remain stale for operators.',
      operatorAction:
        'Review the remediation workflow run, verify the target entry still exists, resolve indexing errors, then requeue if reactivation is still required.',
    },
    workflow: {
      workflowType: 'feedback-remediation-reactivation',
      runId: workflowRunIdForRemediationReactivation,
      subjectId: (payload: RemediationReactivationPayload) => payload.entryId,
    },
  },
  [SKILL_INDEX_FOLLOW_UP_TASK_TYPE]: {
    taskType: SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
    owner: (payload: SkillIndexFollowUpPayload) => ({
      owner: 'skill-artifact',
      subjectId: payload.artifactId,
      subjectType: 'skill',
    }),
    idempotencyKey: {
      description:
        'One follow-up per skill lifecycle transition and reason combination while work is pending/running.',
      format: 'skill.index-follow-up:<artifactId>:<previousState>:<nextState>:<reason>',
    },
    payloadDescription:
      'Lifecycle transition payload for refreshing one skill artifact projection after approval, deactivation, or approved-content updates.',
    maxAttempts: 3,
    deadLetter: {
      stepName: 'dead-letter',
      meaning:
        'Skill projection refresh did not complete after all retries; workflow state is marked failed and retrieval/operator views may stay stale temporarily.',
      operatorAction:
        'Inspect workflow run and queue dead letter, repair the underlying skill indexing failure, then requeue if the transition still applies.',
    },
    workflow: {
      workflowType: 'skill-index-follow-up',
      runId: workflowRunIdForSkillIndexFollowUp,
      subjectId: (payload: SkillIndexFollowUpPayload) => payload.artifactId,
    },
  },
  [BADCASE_EXPORT_DRAFT_TASK_TYPE]: {
    taskType: BADCASE_EXPORT_DRAFT_TASK_TYPE,
    owner: (payload: BadcaseExportDraftPayload) => ({
      owner: 'feedback-badcase',
      subjectId: payload.feedbackId,
      subjectType: 'feedback',
    }),
    idempotencyKey: {
      description:
        'One export-draft task per feedback record while work is pending/running.',
      format:
        'feedback.badcase-export-draft:<feedbackId>',
    },
    payloadDescription:
      'Feedback-derived badcase export draft request bound to one feedback record and its originating entry/query context.',
    maxAttempts: 3,
    deadLetter: {
      stepName: 'dead-letter',
      meaning:
        'The badcase draft export follow-up did not finalize after retries; the feedback record remains without completed async export bookkeeping.',
      operatorAction:
        'Check the queue dead letter and related feedback trace, fix the export/storage issue, then requeue if the draft is still needed.',
    },
    workflow: {
      workflowType: 'badcase-export-draft',
      runId: workflowRunIdForBadcaseExportDraft,
      subjectId: (payload: BadcaseExportDraftPayload) => payload.feedbackId,
    },
  },
} satisfies {
  [TTaskType in SharedJobTaskType]: SharedJobContract<TTaskType>;
};

export function getSharedJobContract<TTaskType extends SharedJobTaskType>(
  taskType: TTaskType,
): SharedJobContract<TTaskType> {
  return sharedJobContracts[taskType];
}

export function getSharedJobWorkflowRunId<TTaskType extends SharedJobTaskType>(
  taskType: TTaskType,
  payload: SharedJobPayloadByType[TTaskType],
): string {
  return getSharedJobContract(taskType).workflow.runId(payload);
}

export interface SharedJobHandler<TPayload> extends TaskHandler<TPayload> {
  workflowType: WorkflowType;
}
