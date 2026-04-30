import path from 'node:path';

import { type AiProviderConfig, loadAiProviderConfig } from './lib/ai/index.js';
import { type RagLogConfig, loadRagLogConfig } from './lib/rag-log.js';
import { type UserOpsLogConfig, loadUserOpsLogConfig } from './lib/user-ops-log.js';

export interface ServerConfig {
  dataFile: string;
  databaseUrl: string | null;
  host: string;
  port: number;
  systemAdminKey: string | null;
  userOpsLog: UserOpsLogConfig;
  ragLog: RagLogConfig;
  ai: AiProviderConfig;
}

export function loadConfig(): ServerConfig {
  return {
    dataFile: path.resolve(
      process.cwd(),
      process.env.TRAPMAP_DATA_FILE ?? '.data/skill-shareer.json',
    ),
    databaseUrl: process.env.TRAPMAP_DATABASE_URL ?? null,
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    systemAdminKey: process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null,
    userOpsLog: loadUserOpsLogConfig(),
    ragLog: loadRagLogConfig(),
    ai: loadAiProviderConfig(),
  };
}
