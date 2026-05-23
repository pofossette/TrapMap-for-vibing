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
import { rankCapsules } from './capsule-recall.js';

/**
 * Input for capsule recall coordinator execution.
 */
export interface CapsuleRecallInput {
  artifacts: SkillArtifactRecord[];
  intent: ParsedIntent;
  governanceFilters: ArtifactGovernanceFilters;
  maxResults: number;
}

/**
 * Result from capsule recall coordinator execution.
 */
export interface CapsuleRecallResult {
  /**
   * Backward-compatible capsule candidates for assembly.
   * Same shape as rankCapsules() output, consumable by getCapsuleRecords().
   */
  capsuleCandidates: CapsuleCandidate[];
  /**
   * Merged multi-channel candidates with channel provenance.
   * In Phase 1, this contains single-channel (heuristic) entries.
   * Future phases will merge multiple channels here.
   */
  mergedCandidates: MergedCapsuleCandidate[];
}

/**
 * Capsule recall coordinator.
 *
 * Orchestrates multi-channel capsule recall and delegates to the capsule
 * channel registry for actual recall execution. In Phase 1, only the
 * heuristic channel is active, providing backward-compatible behavior.
 *
 * Future phases will:
 * - Iterate multiple channels from the registry
 * - Merge channel results with RRF or weighted sum
 * - Re-rank merged candidates using intent-aware scoring
 * - Record channel-level trace metadata
 */
export class CapsuleRecallCoordinator {
  constructor(private readonly registry: CapsuleChannelRegistry) {}

  /**
   * Execute multi-channel capsule recall.
   *
   * Phase 1 implementation:
   * 1. Call rankCapsules() as the single source of truth for scoring
   * 2. Collect channel recall candidates from registered channels
   * 3. Build merged candidates with channel provenance
   *
   * @returns CapsuleRecallResult with CapsuleCandidate[] for assembly
   *          and MergedCapsuleCandidate[] for trace/debug
   */
  async execute(input: CapsuleRecallInput, _steps?: PipelineStep[]): Promise<CapsuleRecallResult> {
    // Phase 1: Use rankCapsules() as the primary ranking engine.
    // This preserves exact backward-compatible scoring behavior.
    const capsuleCandidates = rankCapsules(
      input.artifacts,
      input.intent,
      input.governanceFilters,
      input.maxResults,
    );

    // Collect recall candidates from registered channels for trace.
    // In Phase 1, this is informational; future phases will use
    // channel results to augment/merge with the primary ranking.
    const channelResults: CapsuleRecallCandidate[][] = [];
    for (const channel of this.registry.all()) {
      const candidates = await channel.recall(
        input.artifacts,
        input.intent,
        input.governanceFilters,
        input.maxResults,
      );
      channelResults.push(candidates);
    }

    // Build merged candidates from capsule candidates with channel info
    const mergedCandidates = this.buildMergedCandidates(capsuleCandidates, channelResults);

    return { capsuleCandidates, mergedCandidates };
  }

  /**
   * Build merged candidates, linking CapsuleCandidate scores with
   * channel recall provenance for audit trail and future rerank.
   */
  private buildMergedCandidates(
    capsuleCandidates: CapsuleCandidate[],
    channelResults: CapsuleRecallCandidate[][],
  ): MergedCapsuleCandidate[] {
    // Build channel score lookup by capsuleId
    const channelScoreMap = new Map<string, Map<CapsuleRecallChannelName, number>>();
    for (const candidates of channelResults) {
      for (const c of candidates) {
        let scoreMap = channelScoreMap.get(c.capsuleId);
        if (!scoreMap) {
          scoreMap = new Map();
          channelScoreMap.set(c.capsuleId, scoreMap);
        }
        scoreMap.set(c.channel, c.score);
      }
    }

    return capsuleCandidates.map((c) => {
      const scores = channelScoreMap.get(c.capsuleId);
      const channels: CapsuleRecallChannelName[] = scores
        ? (Array.from(scores.keys()) as CapsuleRecallChannelName[])
        : ['capsule-heuristic'];
      const channelScores: Partial<Record<CapsuleRecallChannelName, number>> = {};
      if (scores) {
        for (const [ch, score] of scores) {
          (channelScores as Record<string, number>)[ch] = score;
        }
      } else {
        channelScores['capsule-heuristic'] = c.finalScore;
      }

      return {
        capsuleId: c.capsuleId,
        artifactId: c.artifactId,
        revision: c.revision,
        channels,
        channelScores,
        preRerankScore: c.finalScore,
        finalScore: c.finalScore,
        reason: c.reason,
      };
    });
  }
}

/**
 * Create a CapsuleRecallCoordinator pre-configured with the heuristic channel.
 */
export function createDefaultCapsuleRecallCoordinator(
  registry: CapsuleChannelRegistry,
): CapsuleRecallCoordinator {
  return new CapsuleRecallCoordinator(registry);
}
