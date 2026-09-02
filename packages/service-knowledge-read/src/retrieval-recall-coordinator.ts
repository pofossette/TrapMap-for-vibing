import {
  InvocationError,
  buildUnknownModeMessage,
} from '@trapmap/backend-core';
import type { retrievalQuerySchema } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import type { KnowledgeRecord } from './store.js';
import { hybridRecall as _hybrid } from './recall/hybrid-channel.js';
import { semanticRecall as _semantic } from './recall/semantic-channel.js';
import { graphAssistedHybridRecall as _graph } from './recall/graph-channel.js';
import { getDbSearchConfig, finalizeSemanticResults, versionMultiplierFor, toScoredEntry, rerankRecallResults, computeSemanticCandidates } from './recall/recall-helpers.js';
export { getDbSearchConfig, finalizeSemanticResults, versionMultiplierFor, toScoredEntry, rerankRecallResults, computeSemanticCandidates };
export { inferChannelsFromMerged } from '@trapmap/backend-core';

export interface DbSearchConfig { enabled: boolean; pool: import('pg').Pool | null; }
export interface GraphRecallTrace { mergeMode: 'mixed'; graphExpansion: 'local-neighborhood'; backendKind: import('./context.js').KnowledgeReadGraphQueryRuntimeState['backendKind']; backendMode: import('./context.js').KnowledgeReadGraphQueryRuntimeState['mode']; graphCandidateCount: number; }
export interface RecallExecutionTrace { graph?: GraphRecallTrace; }
export interface RecallExecutionResult { scoredEntries: import('./retrieval-types.js').ScoredEntry[]; mergedCandidates?: import('./retrieval-types.js').MergedCandidate[]; trace?: RecallExecutionTrace; }

interface RetrievalStrategyLike {
  readonly version: string;
  execute(query: ReturnType<typeof retrievalQuerySchema.parse>, channels: unknown, eligibleEntries: KnowledgeRecord[], services?: SkillShareerServices, auth?: ResolvedAuthContext): Promise<RecallExecutionResult>;
}
interface StrategyRegistryLike {
  get(version: string): RetrievalStrategyLike | undefined;
  all(): Array<Pick<RetrievalStrategyLike, 'version'>>;
}
interface ChannelRegistryLike {
  get(name: string): unknown;
  all(): unknown[];
}

export async function dispatchByMode(
  mode: string,
  _seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  strategyRegistry: StrategyRegistryLike,
  channelRegistry: ChannelRegistryLike,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const strategy = strategyRegistry.get(mode);
  if (!strategy) {
    throw InvocationError.validation(buildUnknownModeMessage(mode, strategyRegistry.all().map((s) => s.version)));
  }
  return strategy.execute(parsed, channelRegistry, eligibleEntries, services, auth);
}

export async function hybridRecall(...args: Parameters<typeof _hybrid>): ReturnType<typeof _hybrid> {
  return _hybrid(...args);
}
export async function semanticRecall(...args: Parameters<typeof _semantic>): ReturnType<typeof _semantic> {
  return _semantic(...args);
}
export async function graphAssistedHybridRecall(...args: Parameters<typeof _graph>): ReturnType<typeof _graph> {
  return _graph(...args);
}
