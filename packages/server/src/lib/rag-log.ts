import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Configuration for RAG retrieval logging.
 */
export interface RagLogConfig {
  enabled: boolean;
  logDir: string;
}

/**
 * A step in the retrieval pipeline with timing information.
 */
export interface PipelineStep {
  name: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * A log entry capturing a RAG retrieval operation.
 * Written as JSON Lines to daily log files for analysis.
 */
export interface RagLogEntry {
  timestamp: string;
  queryId: string;
  seed: string;
  mode: 'semantic' | 'hybrid' | 'graph-assisted' | 'v2-capsule';
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
  };
}

/**
 * Load RAG log configuration from environment variables.
 * LOG_RAG_ENABLED: 'true' to enable, any other value disables (default: false)
 * LOG_RAG_DIR: directory for log files (default: logs/rag)
 */
export function loadRagLogConfig(): RagLogConfig {
  const enabled = process.env.LOG_RAG_ENABLED === 'true';
  const logDir = process.env.LOG_RAG_DIR ?? 'logs/rag';
  return { enabled, logDir };
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
 * Format: qry_{timestamp}_{random_suffix}
 */
export function generateQueryId(): string {
  return `qry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Write a RAG retrieval log entry to the daily log file.
 * This function is fire-and-forget - it does not block the caller.
 * Errors are logged to console but do not throw.
 *
 * @param config - RAG log configuration
 * @param entry - Log entry to write
 */
export async function logRagRetrieval(
  config: RagLogConfig,
  entry: RagLogEntry,
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
    const line = JSON.stringify(entry) + '\n';

    // Append to file
    await appendFile(logFile, line, 'utf-8');
  } catch (error) {
    // Log error but don't throw - logging should not break the request
    console.error('[rag-log] Failed to write log entry:', error);
  }
}
