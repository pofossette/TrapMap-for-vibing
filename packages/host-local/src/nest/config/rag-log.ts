import type { RagLogConfig } from '@trapmap/service-knowledge-read';

import { loadRotationConfig } from './log-rotation.js';

export type { RagLogConfig } from '@trapmap/service-knowledge-read';

export function loadRagLogConfig(): RagLogConfig {
  const enabled = process.env.LOG_RAG_ENABLED === 'true';
  const logDir = process.env.LOG_RAG_DIR ?? 'logs/rag';
  const rotation = loadRotationConfig();
  return { enabled, logDir, ...rotation };
}
