import type {
  BoundaryContext,
  BoundaryExplanation,
  ConflictHint,
  ConflictRelation,
  FreshnessDecayConfig,
  Permission,
  RetrievalQuery,
} from '@trapmap/contracts';
import type {
  RuntimeInfraGraphQueryBackend,
  RuntimeInfraGraphQueryRuntimeState,
  SkillShareerRepos,
} from '@trapmap/runtime-infra';
import type { Pool } from 'pg';

import type { RagLogConfig } from './rag-log.js';
import type {
  ChannelRegistry as KnowledgeReadChannelRegistry,
  RetrievalStrategy as KnowledgeReadStrategy,
} from './retrieval-orchestration.js';
import type {
  MergedCandidate,
  RecallCandidate,
  RoutingChannel,
  ScoredEntry,
  TokenMatchDetail,
} from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

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

export interface KnowledgeReadRoutingDecision {
  selectedMode: string;
  routeFamily: string;
  routingReason: string;
  fallbackApplied: boolean;
  fallbackTarget: string | null;
  confidenceScore: number | null;
  confidenceBucket: 'low' | 'medium' | 'high' | null;
  channelsPlanned: RoutingChannel[];
  channelsUsed: RoutingChannel[];
}

export interface KnowledgeReadVectorSearchOptions {
  queryVector: number[];
  limit: number;
  teamId?: string | null;
  maxLevel?: number;
  scope?: 'global' | 'project';
  entryIds?: string[];
}

export interface KnowledgeReadVectorSearchResult {
  entryId: string;
  similarity: number;
  metadata: {
    shortcut: string;
    labels: string[];
    scope: string;
    requiredLevel: number;
  };
}

export interface KnowledgeReadKeywordRecallFilters {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
  scopes: string[];
}

export interface KnowledgeReadKeywordRecallResult {
  entryId: string;
  score: number;
  tokenMatches: TokenMatchDetail[];
}

export interface KnowledgeReadRetrievalInfra {
  embeddings: {
    generate(text: string): Promise<number[]>;
    hashText(text: string): string;
    getCachedQuery(queryText: string): number[] | null;
    setCachedQuery(queryText: string, vector: number[]): void;
  };
  routing: {
    selectStrategy(mode: string, seed: string): KnowledgeReadRoutingDecision;
    toRoutingTrace(decision: KnowledgeReadRoutingDecision): Record<string, unknown>;
  };
  conflicts: {
    enrichMatches(
      matches: Array<{ entryId: string }>,
      data: { conflicts: ConflictRelation[]; knowledgeEntries: KnowledgeRecord[] },
      governance?: { teamId: string | null; requiredLevel: number },
    ): Map<string, ConflictHint[]>;
  };
  scoring: {
    freshnessConfig: FreshnessDecayConfig;
    computeBoundaryScoreDelta(
      entry: KnowledgeRecord,
      boundaryContext: BoundaryContext | undefined,
    ): number;
    buildBoundaryExplanation(
      entry: KnowledgeRecord,
      boundaryContext: BoundaryContext | undefined,
      boundaryDelta: number,
    ): BoundaryExplanation | undefined;
    filterByBoundary(
      entries: KnowledgeRecord[],
      boundaryContext: BoundaryContext | undefined,
    ): KnowledgeRecord[];
    createSemanticCandidate(entry: KnowledgeRecord, score: number): RecallCandidate;
    mergeCandidates(
      semanticCandidates: RecallCandidate[],
      keywordCandidates: RecallCandidate[],
    ): MergedCandidate[];
    rerankCandidates(
      mergedCandidates: MergedCandidate[],
      queryTokens: string[],
      options: {
        maxCandidates: number;
        boundaryContext?: BoundaryContext;
        freshnessConfig: FreshnessDecayConfig;
        earlyTerminationThreshold?: number;
      },
    ): MergedCandidate[];
    toScoredEntriesFromReranked(candidates: MergedCandidate[]): ScoredEntry[];
  };
  pgRecall: {
    isEnabled(): boolean;
    getPool(store: KnowledgeReadStoreSeam): Pool | null;
    vectorSimilaritySearch(
      pool: Pool,
      options: KnowledgeReadVectorSearchOptions,
    ): Promise<KnowledgeReadVectorSearchResult[]>;
    keywordRecall(
      pool: Pool,
      queryText: string,
      filters: KnowledgeReadKeywordRecallFilters,
      maxResults: number,
    ): Promise<KnowledgeReadKeywordRecallResult[]>;
    graphAssistedRecall(
      queryText: string,
      eligibleEntries: Map<string, KnowledgeRecord>,
      options?: { graphQueryBackend?: RuntimeInfraGraphQueryBackend },
    ): Promise<RecallCandidate[]>;
  };
}

export type KnowledgeReadCacheInvalidationReason =
  | 'approved'
  | 'deactivated'
  | 'remediation-suppressed'
  | 'remediation-reactivated';

export interface KnowledgeReadProjectionCache<V> {
  get(key: string): V | null;
  set(key: string, value: V): void;
  clear(): void;
}

export interface KnowledgeReadSupportInfra {
  governance: {
    isEntryEligible(
      entry: KnowledgeRecord,
      auth: ResolvedAuthContext,
      filters: RetrievalQuery['filters'],
    ): boolean;
  };
  cache: {
    createRetrievalReadModelCache<V>(options: {
      maxSize: number;
      ttlMs: number;
      namespace: string;
    }): KnowledgeReadProjectionCache<V>;
    registerInvalidationListener(options: {
      namespaces: readonly string[];
      invalidate(reason: KnowledgeReadCacheInvalidationReason): void;
    }): void;
    emitInvalidation(reason: KnowledgeReadCacheInvalidationReason): void;
    recordStaleRecovery(namespace: string): void;
  };
  refinement: {
    buildSystemPrompt(maxSentences: number): string;
    buildSystemPromptBlocks(maxSentences: number): unknown[];
  };
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
  retrievalInfra?: KnowledgeReadRetrievalInfra;
  knowledgeReadSupportInfra?: KnowledgeReadSupportInfra;
  graphQueryBackend?: RuntimeInfraGraphQueryBackend;
  graphQuery: RuntimeInfraGraphQueryRuntimeState;
}
