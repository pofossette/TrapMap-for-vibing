/**
 * Dedup-strategy judgment node — rule implementation (design D8).
 *
 * Wraps the pre-contract fingerprint/Jaccard detector
 * (`createCandidateDuplicateDetector`) behind the `DedupStrategyPort`,
 * preserving the current rule behavior exactly.
 * Distributed mode accelerates Jaccard via Go batch-similarity (fallback to JS).
 */

import type { DedupStrategyPort, DedupStrategyResult } from '@trapmap/backend-core';
import { createCandidateDuplicateDetector, dedupTokens } from '@trapmap/backend-core';
import { prefixedId } from '@trapmap/lib';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import { dedupBatchSimilarityWithFallback } from '@trapmap/infra/go-accelerator/fallback.js';

export interface RuleDedupStrategyDeps {
  now?(): string;
  createId?(): string;
}

function overlap(left: string[], right: string[]): string[] {
  const rightTerms = new Set(right.map((term) => term.toLowerCase()));
  return left.filter((term) => rightTerms.has(term.toLowerCase()));
}

export function createRuleDedupStrategy(deps: RuleDedupStrategyDeps = {}): DedupStrategyPort {
  const now = deps.now ?? (() => new Date().toISOString());
  const createId = deps.createId ?? (() => prefixedId('dup'));

  return {
    async detect(input): Promise<DedupStrategyResult> {
      const goClient = getGoAcceleratorClient();
      if (goClient.isEnabled) {
        try {
          const [traps, skills] = await Promise.all([
            input.corpus.listApprovedTraps(input.candidate.teamId),
            input.corpus.listApprovedSkills(input.candidate.teamId),
          ]);
          if (traps.length + skills.length > 0) {
            const leftTokens = input.normalized.tokens;
            const trapTexts = traps.map((t) => `${t.shortcut}\n${t.detail}`);
            const skillTexts = skills.map((s) => `${s.title}\n${s.summary}`);
            const allTexts = [...trapTexts, ...skillTexts];
            const allTokenLists = allTexts.map((t) => dedupTokens(t));
            const sims = await dedupBatchSimilarityWithFallback(
              leftTokens,
              allTokenLists,
              goClient,
            );
            const SEMANTIC_MATCH_CUTOFF = 0.38;
            const HIGH_OVERLAP_THRESHOLD = 0.72;
            const matches: import('@trapmap/contracts').DuplicateMatch[] = [];
            let idx = 0;
            const { createHash } = await import('node:crypto');
            for (const trap of traps) {
              const corpusTokens = allTokenLists[idx]!;
              const sim = sims[idx] ?? 0;
              const parts = [trap.shortcut.trim(), trap.detail.trim(), ...[...trap.labels].sort()];
              const fp = createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
              const exact = fp === input.normalized.fingerprint;
              const score = exact ? 1 : sim;
              idx++;
              if (!exact && score < SEMANTIC_MATCH_CUTOFF) continue;
              matches.push({
                entityType: 'trap',
                entityId: trap.id,
                entityTitle: trap.shortcut,
                similarityScore: exact ? 1 : Math.round(score * 1000) / 1000,
                matchType: exact
                  ? 'exact'
                  : score >= HIGH_OVERLAP_THRESHOLD
                    ? 'high-overlap'
                    : 'semantic-similar',
                overlapDetails: {
                  sharedKeywords: overlap(input.normalized.keywords, trap.labels),
                  sharedTokens: overlap(input.normalized.tokens, corpusTokens),
                  textOverlapPercent: exact ? 100 : Math.round(score * 1000) / 10,
                },
              });
            }
            for (const skill of skills) {
              const corpusTokens = allTokenLists[idx]!;
              const sim = sims[idx] ?? 0;
              const exact = skill.title.trim() === input.normalized.title.trim();
              const score = exact ? 1 : sim;
              idx++;
              if (!exact && score < SEMANTIC_MATCH_CUTOFF) continue;
              matches.push({
                entityType: 'skill',
                entityId: skill.id,
                entityTitle: skill.title,
                similarityScore: exact ? 1 : Math.round(score * 1000) / 1000,
                matchType: exact
                  ? 'exact'
                  : score >= HIGH_OVERLAP_THRESHOLD
                    ? 'high-overlap'
                    : 'semantic-similar',
                overlapDetails: {
                  sharedKeywords: overlap(input.normalized.keywords, skill.keywords),
                  sharedTokens: overlap(input.normalized.tokens, corpusTokens),
                  textOverlapPercent: exact ? 100 : Math.round(score * 1000) / 10,
                },
              });
            }
            matches.sort(
              (a, b) =>
                b.similarityScore - a.similarityScore ||
                a.entityType.localeCompare(b.entityType) ||
                a.entityId.localeCompare(b.entityId),
            );
            const hasExact = matches.some((m) => m.matchType === 'exact');
            const duplicateCase =
              matches.length === 0
                ? null
                : {
                    id: createId(),
                    candidateId: input.candidate.id,
                    detectedAt: now(),
                    detectionVersion: 'owner-v1' as const,
                    matches,
                    highestSimilarity: matches[0]?.similarityScore ?? 0,
                    hasExactDuplicate: hasExact,
                    duplicateType: (hasExact ? 'exact' : 'semantic') as 'exact' | 'semantic',
                  };
            return {
              duplicateCase: duplicateCase as import('@trapmap/contracts').DuplicateCase | null,
              analysisSnapshot: {
                normalizedAt: now(),
                fingerprint: input.normalized.fingerprint,
                keywords: input.normalized.keywords,
                tokens: input.normalized.tokens,
                duplicateTrace: {
                  detector: 'postgresql' as const,
                  matchedLane: (hasExact
                    ? 'exact'
                    : matches.length
                      ? 'indexed-recall'
                      : 'none') as any,
                },
              } as any,
              strategy: 'rule',
            };
          }
        } catch {}
      }
      const detector = createCandidateDuplicateDetector(input.corpus, {
        now,
        createId,
      });
      const { duplicateCase, analysisSnapshot } = await detector(input.candidate, input.normalized);
      return { duplicateCase, analysisSnapshot, strategy: 'rule' };
    },
  };
}
