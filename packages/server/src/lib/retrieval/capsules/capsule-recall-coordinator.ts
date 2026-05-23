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

    const allChannelResults: CapsuleRecallCandidate[][] = [];

    for (const channel of this.registry.all()) {
      const candidates = await channel.recall(
        input.artifacts,
        input.intent,
        input.governanceFilters,
        input.maxResults * 3,
      );
      allChannelResults.push(candidates);
    }

    const totalChannelCandidates = allChannelResults.reduce(
      (sum, results) => sum + results.length,
      0,
    );

    const channelsUsed: CapsuleRecallChannelName[] = [];
    for (const channel of this.registry.all()) {
      const channelResult = allChannelResults.find(
        (cr) => cr.length > 0 && cr[0].channel === channel.name,
      );
      if (channelResult && channelResult.length > 0) {
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
