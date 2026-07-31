/**
 * Candidate recall for label alignment.
 *
 * Given a raw label, finds the top-k candidate canonical labels from the catalog
 * using a deterministic fusion order:
 *   1. exact alias match
 *   2. normalized name match
 *   3. embedding similarity (if embeddings provider available)
 *
 * Results are deduplicated and capped at a compact table size for the LLM prompt.
 */

import type { LabelAlignmentCandidate } from '@trapmap/contracts';
import type { EmbeddingsProvider } from '@trapmap/ai-providers';

import type { LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recommended max candidates for the LLM prompt. */
export const RECOMMENDED_MAX_CANDIDATES = 5;

/** Hard max candidates for the LLM prompt. */
export const HARD_MAX_CANDIDATES = 8;

/** Minimum embedding similarity distance to consider (cosine distance, lower = more similar). */
const EMBEDDING_DISTANCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CandidateRecallResult {
  candidates: LabelAlignmentCandidate[];
  recallBreakdown: {
    exactAliasCount: number;
    normalizedNameCount: number;
    embeddingCount: number;
  };
}

// ---------------------------------------------------------------------------
// Core recall function
// ---------------------------------------------------------------------------

/**
 * Recall top-k candidate canonical labels for a raw label.
 *
 * @param repository - Label repository for catalog queries
 * @param rawLabel - The raw label string to find candidates for
 * @param kind - Optional node kind filter
 * @param embeddings - Optional embeddings provider for semantic recall
 * @param maxCandidates - Max candidates to return (default: RECOMMENDED_MAX_CANDIDATES)
 */
export async function recallCandidates(
  repository: LabelRepository,
  rawLabel: string,
  kind?: string,
  embeddings?: EmbeddingsProvider,
  maxCandidates = RECOMMENDED_MAX_CANDIDATES,
): Promise<CandidateRecallResult> {
  const cappedMax = Math.min(maxCandidates, HARD_MAX_CANDIDATES);
  const normalizedQuery = normalizeLabel(rawLabel);

  const seenIds = new Set<string>();
  const candidates: LabelAlignmentCandidate[] = [];
  const breakdown = { exactAliasCount: 0, normalizedNameCount: 0, embeddingCount: 0 };

  // Phase 1: exact alias match
  const exactAliasResult = await repository.findCanonicalByAlias(rawLabel);
  if (exactAliasResult && exactAliasResult.status === 'active') {
    seenIds.add(exactAliasResult.id);
    const aliases = await repository.listAliases(exactAliasResult.id);
    candidates.push({
      id: exactAliasResult.id,
      canonicalName: exactAliasResult.canonicalName,
      definition: exactAliasResult.definition,
      aliases: aliases.map((a) => a.alias),
      recallReason: 'exact-alias',
    });
    breakdown.exactAliasCount = 1;
  }

  // Phase 2: normalized name match (if we haven't hit the limit)
  if (candidates.length < cappedMax) {
    const nameResults = await repository.searchCandidates(
      normalizedQuery,
      kind,
      cappedMax - candidates.length + 2, // fetch a few extra for dedup
    );

    for (const result of nameResults) {
      if (seenIds.has(result.label.id)) continue;
      if (result.label.status !== 'active') continue;
      if (result.recallReason === 'exact-alias') continue; // already handled
      seenIds.add(result.label.id);
      candidates.push({
        id: result.label.id,
        canonicalName: result.label.canonicalName,
        definition: result.label.definition,
        aliases: result.aliases,
        recallReason: 'normalized-name',
      });
      breakdown.normalizedNameCount++;

      if (candidates.length >= cappedMax) break;
    }
  }

  // Phase 3: embedding similarity (if embeddings provider available and we haven't hit limit)
  if (candidates.length < cappedMax && embeddings) {
    try {
      const normalizedForEmbedding = normalizeLabel(rawLabel);
      const embedding = await embeddings.embed(normalizedForEmbedding);

      if (embedding) {
        const embeddingCandidates = await repository.searchCandidatesByEmbedding(
          embedding,
          kind,
          cappedMax - candidates.length + 2,
        );

        for (const result of embeddingCandidates) {
          if (seenIds.has(result.label.id)) continue;
          if (result.label.status !== 'active') continue;
          if (result.distance > EMBEDDING_DISTANCE_THRESHOLD) continue;
          seenIds.add(result.label.id);
          const aliases = await repository.listAliases(result.label.id);
          candidates.push({
            id: result.label.id,
            canonicalName: result.label.canonicalName,
            definition: result.label.definition,
            aliases: aliases.map((a) => a.alias),
            recallReason: 'semantic-embedding',
          });
          breakdown.embeddingCount++;

          if (candidates.length >= cappedMax) break;
        }
      }
    } catch {
      // Embedding provider failure is non-fatal; skip semantic recall
    }
  }

  return {
    candidates: candidates.slice(0, cappedMax),
    recallBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLabel(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}
