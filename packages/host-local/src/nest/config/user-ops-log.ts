import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { appendWithRotation, loadRotationConfig } from './log-rotation.js';

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

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function logUserOperation(
  config: UserOpsLogConfig,
  entry: UserOpsLogEntry,
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  try {
    await mkdir(config.logDir, { recursive: true });
    const dateStr = formatDate(new Date(entry.timestamp));
    const logFile = path.join(config.logDir, `${dateStr}.log`);
    const line = `${JSON.stringify(entry)}\n`;

    await appendWithRotation(logFile, line, {
      maxFileSizeBytes: config.maxFileSizeBytes,
      maxBackupFiles: config.maxBackupFiles,
    });
  } catch (error) {
    console.error('[user-ops-log] Failed to write log entry:', error);
  }
}
