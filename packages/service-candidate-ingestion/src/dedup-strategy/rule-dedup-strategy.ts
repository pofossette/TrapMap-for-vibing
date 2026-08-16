/**
 * Dedup-strategy judgment node — rule implementation (design D8).
 *
 * Wraps the pre-contract fingerprint/Jaccard detector
 * (`createCandidateDuplicateDetector`) behind the `DedupStrategyPort`,
 * preserving the current rule behavior exactly.
 */

import type { DedupStrategyPort, DedupStrategyResult } from '@trapmap/backend-core';
import { createCandidateDuplicateDetector } from '@trapmap/backend-core';
import { prefixedId } from '@trapmap/lib';

export interface RuleDedupStrategyDeps {
  /** Timestamp source for detection metadata. */
  now?(): string;
  /** ID source for produced duplicate cases. */
  createId?(): string;
}

export function createRuleDedupStrategy(deps: RuleDedupStrategyDeps = {}): DedupStrategyPort {
  const now = deps.now ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => prefixedId('dup'));

  return {
    async detect(input): Promise<DedupStrategyResult> {
      const detector = createCandidateDuplicateDetector(input.corpus, {
        now,
        createId,
      });
      const { duplicateCase, analysisSnapshot } = await detector(
        input.candidate,
        input.normalized,
      );
      return { duplicateCase, analysisSnapshot, strategy: 'rule' };
    },
  };
}
