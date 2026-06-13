import type { LifecycleState } from '@trapmap/contracts';
import type { TaskHandler } from '@trapmap/server/lib/queue/task-queue.js';

export const KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE = 'knowledge.index-follow-up';
export const REMEDIATION_REACTIVATION_TASK_TYPE = 'feedback.remediation-reactivation';
export const BADCASE_EXPORT_DRAFT_TASK_TYPE = 'feedback.badcase-export-draft';

export type SharedJobTaskType =
  | typeof KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE
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

export interface BadcaseExportDraftPayload {
  feedbackId: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  queryId: string | null;
}

export interface SharedJobHandler<TPayload> extends TaskHandler<TPayload> {
  workflowType?: 'knowledge-index-follow-up' | 'feedback-remediation-reactivation' | 'badcase-export-draft';
}
