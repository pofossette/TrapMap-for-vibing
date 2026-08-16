/**
 * Channel-merge judgment node contract (design D8).
 *
 * Merges multi-channel recall candidates (semantic/keyword/graph) into a
 * single ranked list. The rule implementation wraps the pre-contract
 * `mergeCandidatesWithGraph` merge rules; replacement strategies plug in
 * behind the same port.
 */

import type { MergedCandidateLike, RecallCandidateLike } from '../knowledge-read/domain/ranking.js';

/** Input to channel merging. */
export interface ChannelMergeInput<E> {
  /** Candidates already merged from the hybrid (semantic+keyword) pass. */
  hybridCandidates: MergedCandidateLike<E>[];
  /** Additional candidates recalled from the graph channel. */
  graphCandidates: RecallCandidateLike<E>[];
}

/**
 * Judgment-node contract for retrieval channel merging.
 */
export interface ChannelMergePort<E> {
  merge(input: ChannelMergeInput<E>): Promise<MergedCandidateLike<E>[]>;
}
