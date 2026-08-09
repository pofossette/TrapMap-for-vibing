import type { RoutingTrace } from '@trapmap/contracts';

import { loadRotationConfig } from './log-rotation.js';

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

// fallow-ignore-next-line unused-type -- log entry shape for rag observability
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

