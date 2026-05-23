import type { PipelineStep } from '../../../rag-log.js';
import type { SkillArtifactRecord } from '../../../store.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleCandidate,
  CapsuleRecallCandidate,
  CapsuleRecallChannelName,
  MergedCapsuleCandidate,
  ParsedIntent,
} from '../types.js';
import type { CapsuleChannelRegistry } from './capsule-channel-registry.js';
import { mergeCapsuleCandidates } from './scoring/merge.js';
import { rerankMergedCapsules } from './scoring/rerank.js';

export interface CapsuleRecallInput {
  artifacts: SkillArtifactRecord[];
  intent: ParsedIntent;
  governanceFilters: ArtifactGovernanceFilters;
  maxResults: number;
}

export interface CapsuleRecallResult {
  capsuleCandidates: CapsuleCandidate[];
  mergedCandidates: MergedCapsuleCandidate[];
  channelsPlanned: CapsuleRecallChannelName[];
  channelsUsed: CapsuleRecallChannelName[];
  channelsFailed: CapsuleRecallChannelName[];
  channelErrors: Partial<Record<CapsuleRecallChannelName, string>>;
  mergeStats: {
    totalChannelCandidates: number;
    preMergeCount: number;
    postMergeCount: number;
  };
}

export class CapsuleRecallCoordinator {
  constructor(private readonly registry: CapsuleChannelRegistry) {}

  async execute(input: CapsuleRecallInput, _steps?: PipelineStep[]): Promise<CapsuleRecallResult> {
    const channelsPlanned: CapsuleRecallChannelName[] = this.registry.all().map((ch) => ch.name);
    const channelsFailed: CapsuleRecallChannelName[] = [];
    const channelErrors: Partial<Record<CapsuleRecallChannelName, string>> = {};

    const allChannelResults: CapsuleRecallCandidate[][] = [];

    for (const channel of this.registry.all()) {
      try {
        const candidates = await channel.recall(
          input.artifacts,
          input.intent,
          input.governanceFilters,
          input.maxResults * 3,
        );
        allChannelResults.push(candidates);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        channelsFailed.push(channel.name);
        (channelErrors as Record<string, string>)[channel.name] = message;
        allChannelResults.push([]);
      }
    }

    const totalChannelCandidates = allChannelResults.reduce(
      (sum, results) => sum + results.length,
      0,
    );

    const channelsUsed: CapsuleRecallChannelName[] = [];
    const registeredChannels = this.registry.all();
    for (let i = 0; i < registeredChannels.length; i++) {
      const channel = registeredChannels[i];
      const results = allChannelResults[i];
      if (results && results.length > 0) {
        channelsUsed.push(channel.name);
      }
    }

    const preMergeCount = new Set(allChannelResults.flat().map((c) => c.capsuleId)).size;

    const merged = mergeCapsuleCandidates(allChannelResults);

    const postMergeCount = merged.length;

    const capsuleCandidates = rerankMergedCapsules(
      merged,
      input.artifacts,
      input.intent,
      input.maxResults,
      input.governanceFilters,
    );

    const capsuleScoreMap = new Map(capsuleCandidates.map((c) => [c.capsuleId, c]));

    const mergedCandidates: MergedCapsuleCandidate[] = merged.map((mc) => {
      const reranked = capsuleScoreMap.get(mc.capsuleId);
      return {
        ...mc,
        finalScore: reranked?.finalScore ?? mc.preRerankScore,
        reason: reranked?.reason ?? mc.reason,
      };
    });

    return {
      capsuleCandidates,
      mergedCandidates,
      channelsPlanned,
      channelsUsed,
      channelsFailed,
      channelErrors,
      mergeStats: {
        totalChannelCandidates,
        preMergeCount,
        postMergeCount,
      },
    };
  }
}

export function createDefaultCapsuleRecallCoordinator(
  registry: CapsuleChannelRegistry,
): CapsuleRecallCoordinator {
  return new CapsuleRecallCoordinator(registry);
}
