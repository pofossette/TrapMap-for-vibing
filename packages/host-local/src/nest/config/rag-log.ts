import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { RoutingTrace } from '@trapmap/contracts';
import { formatDate } from '@trapmap/lib';

import { appendWithRotation, loadRotationConfig } from './log-rotation.js';

export interface RagLogConfig {
  enabled: boolean;
  logDir: string;
  maxFileSizeBytes: number;
  maxBackupFiles: number;
}

export interface PipelineStep {
  name: string;
  latencyMs: number;
  inputSize?: number;
  outputSize?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

// fallow-ignore-next-line unused-type
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

export function loadRagLogConfig(): RagLogConfig {
  const enabled = process.env.LOG_RAG_ENABLED === 'true';
  const logDir = process.env.LOG_RAG_DIR ?? 'logs/rag';
  const rotation = loadRotationConfig();
  return { enabled, logDir, ...rotation };
}

export async function logRagRetrieval(config: RagLogConfig, entry: RagLogEntry): Promise<void> {
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
    console.error('[rag-log] Failed to write log entry:', error);
  }
}
