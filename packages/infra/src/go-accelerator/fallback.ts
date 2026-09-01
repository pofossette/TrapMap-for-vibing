import { canonicalJsonStringify } from '@trapmap/lib/canonical-json.js';
import { sha256 } from '@trapmap/lib/hash.js';
import {
  cosineSimilarity,
  createDeterministicFallbackVector,
  normalizeVector,
} from '@trapmap/lib/vector.js';
import type { GoAcceleratorClient } from './client.js';

/**
 * Fallback wrappers that try Go accelerator first, then local JS.
 * Used only in distributed mode when enabled; otherwise direct JS.
 */
export async function canonicalHashWithFallback(
  payload: unknown,
  client: GoAcceleratorClient | null,
): Promise<{ canonical: string; hash: string }> {
  if (client?.isEnabled) {
    try {
      return await client.canonicalHash(payload);
    } catch {
      // fall through to JS
    }
  }
  const canonical = canonicalJsonStringify(payload);
  const hash = await sha256(canonical);
  return { canonical, hash };
}

export async function cosineWithFallback(
  a: number[],
  b: number[],
  client: GoAcceleratorClient | null,
): Promise<number> {
  if (client?.isEnabled) {
    try {
      const res = await client.cosine(a, b);
      return res.similarity;
    } catch {
      // fallback
    }
  }
  return cosineSimilarity(a, b);
}

export async function batchCosineWithFallback(
  query: number[],
  vectors: number[][],
  client: GoAcceleratorClient | null,
): Promise<number[]> {
  if (client?.isEnabled) {
    try {
      const res = await client.batchCosine(query, vectors);
      return res.scores;
    } catch {
      // fallback
    }
  }
  return vectors.map((v) => cosineSimilarity(query, v));
}

export async function deterministicFallbackWithFallback(
  text: string,
  dim: number | undefined,
  client: GoAcceleratorClient | null,
): Promise<number[]> {
  const d = dim ?? 384;
  if (client?.isEnabled) {
    try {
      const res = await client.fallbackVector(text, d);
      return res.vector;
    } catch {
      // fallback
    }
  }
  return createDeterministicFallbackVector(text, d);
}

export async function rankingBatchWithFallback(
  params: {
    entries: Array<{
      id: string;
      semanticScore: number;
      keywordScore: number;
      graphScore?: number;
      channelScores: Record<string, number>;
      combinedScore: number;
      tokenMatches: Array<{ token: string; fields: string[] }>;
      channels: string[];
      preRerankScore: number;
      finalScore: number;
      labels: string[];
      scope: string;
      shortcut: string;
      detail: string;
      decayState?: string;
      boundary?: { context?: string[]; exclusions?: Array<{ kind: string; description: string }> };
    }>;
    semanticEntries?: typeof params.entries;
    keywordEntries?: typeof params.entries;
    graphEntries?: typeof params.entries;
    queryTokens?: string[];
    maxCandidates?: number;
    boundaryContext?: { contexts: string[]; platform?: string };
  },
  client: GoAcceleratorClient | null,
  localFallback: () => typeof params.entries,
): Promise<typeof params.entries> {
  if (client?.isEnabled) {
    try {
      const res = await client.rankingBatch(params as any);
      return res.merged as any;
    } catch {
      // fallback
    }
  }
  return localFallback();
}

export async function keywordScoreWithFallback(
  queryTokens: string[],
  entryTokens: { shortcut: string[]; detail: string[]; labels: string[] },
  client: GoAcceleratorClient | null,
): Promise<{ score: number; tokenMatches: Array<{ token: string; fields: string[] }> }> {
  if (client?.isEnabled) {
    try {
      return await client.keywordScore({ queryTokens, entryTokens });
    } catch {}
  }
  // local fallback mirrors tokenization.ts scoreKeywordEntry weights 3/2/1
  const KEYWORD_LABEL_WEIGHT = 3.0;
  const KEYWORD_SHORTCUT_WEIGHT = 2.0;
  const KEYWORD_DETAIL_WEIGHT = 1.0;
  const maxFieldScore = KEYWORD_LABEL_WEIGHT + KEYWORD_SHORTCUT_WEIGHT + KEYWORD_DETAIL_WEIGHT;
  if (queryTokens.length === 0) return { score: 0, tokenMatches: [] };
  const shortcutSet = new Set(entryTokens.shortcut);
  const detailSet = new Set(entryTokens.detail);
  const labelsSet = new Set(entryTokens.labels);
  let totalWeightedScore = 0;
  let maxPossibleScore = 0;
  const tokenMatches: Array<{ token: string; fields: Array<'shortcut' | 'detail' | 'labels'> }> =
    [];
  for (const token of queryTokens) {
    const fields: Array<'shortcut' | 'detail' | 'labels'> = [];
    let tokenScore = 0;
    if (labelsSet.has(token)) {
      tokenScore += KEYWORD_LABEL_WEIGHT;
      fields.push('labels');
    }
    if (shortcutSet.has(token)) {
      tokenScore += KEYWORD_SHORTCUT_WEIGHT;
      fields.push('shortcut');
    }
    if (detailSet.has(token)) {
      tokenScore += KEYWORD_DETAIL_WEIGHT;
      fields.push('detail');
    }
    if (fields.length > 0) tokenMatches.push({ token, fields });
    totalWeightedScore += tokenScore;
    maxPossibleScore += maxFieldScore;
  }
  const score = maxPossibleScore > 0 ? totalWeightedScore / maxPossibleScore : 0;
  return { score: Math.min(1, Math.max(0, score)), tokenMatches };
}

export async function dedupFingerprintWithFallback(
  parts: string[],
  client: GoAcceleratorClient | null,
): Promise<string> {
  if (client?.isEnabled) {
    try {
      const res = await client.dedupFingerprint(parts);
      return res.fingerprint;
    } catch {}
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

export async function dedupBatchSimilarityWithFallback(
  leftTokens: string[],
  rightTokensList: string[][],
  client: GoAcceleratorClient | null,
): Promise<number[]> {
  if (client?.isEnabled && rightTokensList.length > 0) {
    try {
      const res = await client.dedupBatchSimilarity(leftTokens, rightTokensList);
      return res.similarities;
    } catch {}
  }
  // JS fallback: per-pair Jaccard
  return rightTokensList.map((rightTokens) => {
    const leftSet = new Set(leftTokens.map((t) => t.toLowerCase()));
    const rightSet = new Set(rightTokens.map((t) => t.toLowerCase()));
    if (leftSet.size === 0 || rightSet.size === 0) return 0;
    let shared = 0;
    for (const k of leftSet) if (rightSet.has(k)) shared++;
    const union = leftSet.size + rightSet.size - shared;
    return union === 0 ? 0 : shared / union;
  });
}

export async function dedupSimilarityWithFallback(
  leftTokens: string[],
  rightTokens: string[],
  client: GoAcceleratorClient | null,
): Promise<number> {
  if (client?.isEnabled) {
    try {
      const res = await client.dedupSimilarity(leftTokens, rightTokens);
      return res.similarity;
    } catch {}
  }
  const leftSet = new Set(leftTokens.map((t) => t.toLowerCase()));
  const rightSet = new Set(rightTokens.map((t) => t.toLowerCase()));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let shared = 0;
  for (const k of leftSet) if (rightSet.has(k)) shared++;
  const union = leftSet.size + rightSet.size - shared;
  return union === 0 ? 0 : shared / union;
}

export async function geneDeriveBatchWithFallback(
  traps: Array<{ trapId: string; trapText: string; derivationUnitId: string }>,
  client: GoAcceleratorClient | null,
): Promise<
  Array<{
    trapId: string;
    derivationUnitId: string;
    sections: {
      MATCH: string[];
      GOAL: string[];
      STRATEGY: string[];
      AVOID: string[];
      VERIFY: string[];
    };
    contentHash: string;
    sourceHash: string;
  }>
> {
  if (client?.isEnabled) {
    try {
      const res = await client.geneDeriveBatch(traps);
      return res.results;
    } catch {}
  }
  // fallback: host-local sync deriveOne per trap (simplified, uses same regex logic as backend-core)
  // For host-local, caller should use backend-core directly; this fallback returns empty to force local path
  return [];
}

export async function normalizeWithFallback(vector: number[]): Promise<number[]> {
  // normalize is pure and fast; JS is sufficient, but keep hook for future Go path
  return normalizeVector(vector);
}
