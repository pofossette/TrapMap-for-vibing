import type { Permission } from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/runtime-infra';
import type {
  GraphQueryBackend,
  GraphQueryRuntimeState,
} from '@trapmap/server/lib/graph-query/index.js';
import type { Pool } from 'pg';

import type { RagLogConfig } from './rag-log.js';
import type {
  ChannelRegistry as KnowledgeReadChannelRegistry,
  RetrievalStrategy as KnowledgeReadStrategy,
} from './retrieval-orchestration.js';

export interface ResolvedAuthContext {
  subjectType: 'user' | 'system-admin';
  actorId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
  effectivePermissions: Permission[];
  localSingleUserMode?: boolean;
  user: null;
  membership: null;
  team: null;
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
    get(version: string): KnowledgeReadStrategy | undefined;
    all(): KnowledgeReadStrategy[];
  };
  channelRegistry: Pick<KnowledgeReadChannelRegistry, 'get' | 'all'>;
  ai: KnowledgeReadAiServices;
  store: KnowledgeReadStoreSeam;
  graphQueryBackend?: GraphQueryBackend;
  graphQuery: GraphQueryRuntimeState;
}
