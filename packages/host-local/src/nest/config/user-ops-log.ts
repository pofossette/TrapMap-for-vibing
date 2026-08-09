import { loadRotationConfig } from './log-rotation.js';

export type UserOpsAction =
  | 'search'
  | 'submit'
  | 'edit'
  | 'review'
  | 'review-list'
  | 'import'
  | 'export'
  | 'trap-submit'
  | 'trap-resubmit'
  | 'trap-supersede'
  | 'supersede'
  | 'manual-result'
  | 'apply-resolution'
  | 'plan'
  | 'decay-list'
  | 'decay-batch'
  | 'decay-search'
  | 'feedback'
  | 'feedback-list'
  | 'feedback-batch'
  | 'maintenance-list'
  | 'maintenance-batch'
  | 'reconcile-knowledge-indexes';

// fallow-ignore-next-line unused-type -- log entry shape for user-ops observability
export interface UserOpsLogEntry {
  timestamp: string;
  actorId: string;
  actorHandle: string;
  action: UserOpsAction;
  targetId: string | null;
  teamId: string | null;
  metadata: Record<string, unknown>;
}

export interface UserOpsLogConfig {
  enabled: boolean;
  logDir: string;
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

export function loadUserOpsLogConfig(): UserOpsLogConfig {
  const enabled = process.env.LOG_USER_OPS_ENABLED === 'true';
  const logDir = process.env.LOG_USER_OPS_DIR ?? 'logs/user-ops';
  const rotation = loadRotationConfig();
  return { enabled, logDir, ...rotation };
}
