export type WorkflowType =
  | 'candidate-processing'
  | 'capsule-index-rebuild'
  | 'knowledge-index-follow-up'
  | 'feedback-remediation-reactivation'
  | 'badcase-export-draft';

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowRunSnapshot {
  runId: string;
  workflowType: WorkflowType;
  subjectId: string;
  status: WorkflowRunStatus;
  stepName: string | null;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  stats: Record<string, number | string | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunUpdate {
  status?: WorkflowRunStatus;
  stepName?: string | null;
  attempt?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  stats?: Record<string, number | string | boolean | null>;
}
