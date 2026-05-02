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
  | 'feedback';

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

/**
 * Load user ops log configuration from environment variables.
 * LOG_USER_OPS_ENABLED: 'true' to enable, any other value disables (default: false)
 * LOG_USER_OPS_DIR: directory for log files (default: logs/user-ops)
 * LOG_MAX_FILE_SIZE_MB: max file size in MB before rotation (default: 10)
 * LOG_MAX_BACKUP_FILES: max backup files to keep (default: 5)
 */
export function loadUserOpsLogConfig(): UserOpsLogConfig {
  const enabled = process.env.LOG_USER_OPS_ENABLED === 'true';
  const logDir = process.env.LOG_USER_OPS_DIR ?? 'logs/user-ops';
  const rotation = loadRotationConfig();
  return { enabled, logDir, ...rotation };
}

/**
 * Format a date as YYYY-MM-DD for daily log file naming.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Write a user operation log entry to the daily log file.
 * This function is fire-and-forget - it does not block the caller.
 * Errors are logged to console but do not throw.
 *
 * @param config - User ops log configuration
 * @param entry - Log entry to write
 */
export async function logUserOperation(
  config: UserOpsLogConfig,
  entry: UserOpsLogEntry,
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  try {
    // Ensure log directory exists
    await mkdir(config.logDir, { recursive: true });

    // Build daily log file path
    const dateStr = formatDate(new Date(entry.timestamp));
    const logFile = path.join(config.logDir, `${dateStr}.log`);

    // Format as JSON Lines (one JSON object per line)
    const line = `${JSON.stringify(entry)}\n`;

    // Use rotation-aware append
    await appendWithRotation(logFile, line, {
      maxFileSizeBytes: config.maxFileSizeBytes,
      maxBackupFiles: config.maxBackupFiles,
    });
  } catch (error) {
    // Log error but don't throw - logging should not break the request
    console.error('[user-ops-log] Failed to write log entry:', error);
  }
}
