import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { RoutingTrace } from '@trapmap/contracts';

/**
 * Configuration for RAG retrieval logging.
 */
export interface RagLogConfig {
  enabled: boolean;
  logDir: string;
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

/**
 * A step in the retrieval pipeline with timing information.
 */
export interface PipelineStep {
  name: string;
  latencyMs: number;
  /** 输入数据量（如 entries 数量） */
  inputSize?: number;
  /** 输出数据量（如匹配结果数量） */
  outputSize?: number;
  metadata?: Record<string, unknown>;
  /** Error message if the step failed */
  error?: string;
}

/**
 * A log entry capturing a RAG retrieval operation.
 * Written as JSON Lines to daily log files for analysis.
 */
export interface RagLogEntry {
  timestamp: string;
  queryId: string;
  seed: string;
  mode: 'semantic' | 'hybrid' | 'graph-assisted' | 'v2-capsule' | 'v3-graph-plan';
  actorId: string;
  teamId: string | null;
  pipelineSteps: PipelineStep[];
  totalLatencyMs: number;
  resultCount: number;
  metadata: {
    filters?: { labels: string[]; scopes: string[] };
    maxResults: number;
    includeSummary: boolean;
    includeRefinement: boolean;
    routingTrace?: RoutingTrace;
  };
}

/**
 * Load RAG log configuration from environment variables.
 * LOG_RAG_ENABLED: 'true' to enable, any other value disables (default: false)
 * LOG_RAG_DIR: directory for log files (default: logs/rag)
 * LOG_MAX_FILE_SIZE_MB: max file size in MB before rotation (default: 10)
 * LOG_MAX_BACKUP_FILES: max backup files to keep (default: 5)
 */
export function loadRagLogConfig(): RagLogConfig {
  const enabled = process.env.LOG_RAG_ENABLED === 'true';
  const logDir = process.env.LOG_RAG_DIR ?? 'logs/rag';
  const maxFileSizeMb = Number(process.env.LOG_MAX_FILE_SIZE_MB ?? '10');
  const maxBackupFiles = Number(process.env.LOG_MAX_BACKUP_FILES ?? '5');
  return {
    enabled,
    logDir,
    maxFileSizeBytes: Number.isFinite(maxFileSizeMb)
      ? maxFileSizeMb * 1024 * 1024
      : 10 * 1024 * 1024,
    maxBackupFiles: Number.isFinite(maxBackupFiles) ? maxBackupFiles : 5,
  };
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
 * Generate a unique query ID for a RAG retrieval operation.
 * Format: qry_{id_segment}
 */
export function generateQueryId(): string {
  return `qry_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function rotateBackups(logFile: string, maxBackupFiles: number): Promise<void> {
  if (maxBackupFiles <= 0) {
    await rm(logFile, { force: true });
    return;
  }

  await rm(`${logFile}.${maxBackupFiles}`, { force: true });
  for (let index = maxBackupFiles - 1; index >= 1; index -= 1) {
    const source = `${logFile}.${index}`;
    const target = `${logFile}.${index + 1}`;
    try {
      await rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  try {
    await rename(logFile, `${logFile}.1`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function appendWithRotation(
  logFile: string,
  line: string,
  config: Pick<RagLogConfig, 'maxFileSizeBytes' | 'maxBackupFiles'>,
): Promise<void> {
  let shouldRotate = false;
  try {
    const info = await stat(logFile);
    shouldRotate = info.size + Buffer.byteLength(line) > config.maxFileSizeBytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (shouldRotate) {
    await rotateBackups(logFile, config.maxBackupFiles);
  }

  await appendFile(logFile, line, 'utf-8');
}

/**
 * Write a RAG retrieval log entry to the daily log file.
 * This function is fire-and-forget - it does not block the caller.
 * Errors are logged to console but do not throw.
 *
 * @param config - RAG log configuration
 * @param entry - Log entry to write
 */
export async function logRagRetrieval(config: RagLogConfig, entry: RagLogEntry): Promise<void> {
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
    await appendWithRotation(logFile, line, config);
  } catch (error) {
    // Log error but don't throw - logging should not break the request
    console.error('[rag-log] Failed to write log entry:', error);
  }
}
