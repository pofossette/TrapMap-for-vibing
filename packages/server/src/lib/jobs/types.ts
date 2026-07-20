import type { LifecycleState } from '@trapmap/contracts';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';
import type { WorkflowType } from '@trapmap/server/lib/workflows/types.js';

const CANDIDATE_PROCESSING_TASK_TYPE = 'candidate_processing';
export const KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE = 'knowledge.index-follow-up';
export const SKILL_INDEX_FOLLOW_UP_TASK_TYPE = 'skill.index-follow-up';

export type SharedJobTaskType =
  | typeof CANDIDATE_PROCESSING_TASK_TYPE
  | typeof KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE
  | typeof SKILL_INDEX_FOLLOW_UP_TASK_TYPE;

export interface KnowledgeIndexFollowUpPayload {
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
}

export interface SkillIndexFollowUpPayload {
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
}

export interface CandidateProcessingPayload {
  candidateId: string;
  retryCount: number;
}

export type SharedJobPayloadByType = {
  [CANDIDATE_PROCESSING_TASK_TYPE]: CandidateProcessingPayload;
  [KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE]: KnowledgeIndexFollowUpPayload;
  [SKILL_INDEX_FOLLOW_UP_TASK_TYPE]: SkillIndexFollowUpPayload;
};

export type SharedJobOwnerContext =
  | {
      owner: 'candidate-submission';
      subjectId: string;
      subjectType: 'candidate';
    }
  | {
      owner: 'knowledge-entry';
      subjectId: string;
      subjectType: 'trap';
    }
  | {
      owner: 'skill-artifact';
      subjectId: string;
      subjectType: 'skill';
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

function workflowRunIdForKnowledgeIndexFollowUp(payload: KnowledgeIndexFollowUpPayload): string {
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

function defineSharedJobContract<TTaskType extends SharedJobTaskType>(
  contract: SharedJobContract<TTaskType>,
): SharedJobContract<TTaskType> {
  return contract;
}

export const sharedJobContracts = {
  [CANDIDATE_PROCESSING_TASK_TYPE]: defineSharedJobContract({
    taskType: CANDIDATE_PROCESSING_TASK_TYPE,
    owner: (payload: CandidateProcessingPayload) => ({
      owner: 'candidate-submission',
      subjectId: payload.candidateId,
      subjectType: 'candidate',
    }),
    idempotencyKey: {
      description:
        'One candidate-processing task per candidate while work is pending/running; retries reuse the same durable work item.',
      format: 'candidate_processing:<candidateId>',
    },
    payloadDescription:
      'Candidate ingestion follow-up payload that advances one durable candidate through duplicate analysis and review readiness.',
    maxAttempts: 3,
    deadLetter: {
      stepName: 'dead-letter',
      meaning:
        'Candidate processing exhausted retries and the candidate remains outside duplicate-detected or review-ready states.',
      operatorAction:
        'Inspect the candidate workflow run and queue dead letter, repair duplicate-analysis failures, then requeue if the candidate is still actionable.',
    },
    workflow: {
      workflowType: 'candidate-processing',
      runId: (payload: CandidateProcessingPayload) => `wf_candidate_${payload.candidateId}`,
      subjectId: (payload: CandidateProcessingPayload) => payload.candidateId,
    },
  }),
  [KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE]: defineSharedJobContract({
    taskType: KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
    owner: (payload: KnowledgeIndexFollowUpPayload) => ({
      owner: 'knowledge-entry',
      subjectId: payload.entryId,
      subjectType: 'trap',
    }),
    idempotencyKey: {
      description:
        'One follow-up per knowledge lifecycle transition and reason combination while work is pending/running.',
      format: 'knowledge.index-follow-up:<entryId>:<previousState>:<nextState>:<reason>',
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
  }),
  [SKILL_INDEX_FOLLOW_UP_TASK_TYPE]: defineSharedJobContract({
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
  }),
} satisfies { [TTaskType in SharedJobTaskType]: SharedJobContract<TTaskType> };

export function getSharedJobContract<TTaskType extends SharedJobTaskType>(
  taskType: TTaskType,
): SharedJobContract<TTaskType> {
  return sharedJobContracts[taskType] as unknown as SharedJobContract<TTaskType>;
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
