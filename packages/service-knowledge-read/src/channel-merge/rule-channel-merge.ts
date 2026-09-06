/**
 * Channel-merge judgment node — rule implementation (design D8).
 *
 * Wraps the pre-contract `mergeCandidatesWithGraph` merge rules (hybrid
 * + graph channel fusion into a single combinedScore-ranked list).
 * Replacement strategies plug in behind the same port.
 */

import type { ChannelMergePort } from '@trapmap/backend-core';
import { mergeCandidatesWithGraph } from '@trapmap/backend-core';

/**
 * Rule implementation of the channel-merge port: merges the hybrid
 * candidates with graph-channel candidates using the canonical
 * graph-merge ranking rules.
 */
export function createRuleChannelMerge<E extends { id: string }>(): ChannelMergePort<E> {
  return {
    async merge(input) {
      return mergeCandidatesWithGraph(input.hybridCandidates, input.graphCandidates);
    },
  };
}
