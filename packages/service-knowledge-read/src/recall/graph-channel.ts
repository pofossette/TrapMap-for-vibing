import { createGraphRecallTrace } from '@trapmap/backend-core';
import type { ChannelMergePort } from '@trapmap/backend-core';
import type { retrievalQuerySchema } from '@trapmap/contracts';
import { createRuleChannelMerge } from '../channel-merge/rule-channel-merge.js';
import type { SkillShareerServices } from '../context.js';
import { getRetrievalInfra } from '../retrieval-infra.js';
import { keywordRecall, normalizeQuery } from '../retrieval-keyword.js';
import type { RecallExecutionResult } from '../retrieval-recall-coordinator.js';
import type { KnowledgeRecord } from '../store.js';
import { computeSemanticCandidates, rerankRecallResults } from './recall-helpers.js';

export async function graphRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
): Promise<RecallExecutionResult> {
  return graphAssistedHybridRecall(seed, eligibleEntries, parsed, services);
}

export async function graphAssistedHybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const infra = services ? getRetrievalInfra(services) : null;
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) eligibleEntriesMap.set(entry.id, entry);
  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    computeSemanticCandidates(
      services!,
      seed,
      eligibleEntries,
      parsed.filters,
      parsed.boundaryContext?.versions,
    ),
    keywordRecall(seed, eligibleEntries),
    infra!.pgRecall.graphAssistedRecall(
      seed,
      eligibleEntriesMap,
      services?.graphQueryBackend ? { graphQueryBackend: services.graphQueryBackend } : undefined,
    ),
  ]);
  const governedGraphCandidates = graphCandidates
    .map((candidate) => {
      const eligibleEntry = eligibleEntriesMap.get(candidate.entry.id);
      if (!eligibleEntry) return null;
      return candidate.entry === eligibleEntry ? candidate : { ...candidate, entry: eligibleEntry };
    })
    .filter(
      (
        candidate,
      ): candidate is Awaited<
        ReturnType<ReturnType<typeof getRetrievalInfra>['pgRecall']['graphAssistedRecall']>
      >[number] => candidate !== null,
    );
  const hybridMerged = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  const channelMerge: ChannelMergePort<KnowledgeRecord> =
    services?.channelMerge ?? createRuleChannelMerge();
  const finalMerged = await channelMerge.merge({
    hybridCandidates: hybridMerged,
    graphCandidates: governedGraphCandidates,
  });
  const reranked = await rerankRecallResults(infra!, finalMerged, queryTokens, parsed);
  return {
    ...reranked,
    trace: {
      graph: createGraphRecallTrace(
        services?.graphQueryBackend?.getRuntimeState() ?? services?.graphQuery,
        governedGraphCandidates.length,
      ),
    },
  };
}
