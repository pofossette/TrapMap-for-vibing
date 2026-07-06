import type { SkillShareerRepos } from '@trapmap/runtime-infra';
import type { Pool } from 'pg';

import type { RagLogConfig } from './rag-log.js';

export interface ResolvedAuthContext {
  subjectType: 'user' | 'system-admin';
  actorId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
  effectivePermissions: string[];
  localSingleUserMode?: boolean;
}

export interface KnowledgeReadChatProvider {
  isConfigured: boolean;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
  invokeWithBlocks?(blocks: unknown[], userMessage: string): Promise<string>;
}

export interface KnowledgeReadAiServices {
  chat: KnowledgeReadChatProvider;
}

export interface KnowledgeReadStoreSeam {
  getPool?(): Pool;
}

export interface SkillShareerServices {
  config: {
    ragLog: RagLogConfig;
  };
  repos: SkillShareerRepos;
  strategyRegistry: {
    get(version: string): unknown;
    all(): unknown[];
  };
  channelRegistry: {
    get(name: string): unknown;
    all(): unknown[];
  };
  ai: KnowledgeReadAiServices;
  store: KnowledgeReadStoreSeam;
  graphQueryBackend?: unknown;
  graphQuery: {
    backendKind: string;
    mode: string;
  };
}
