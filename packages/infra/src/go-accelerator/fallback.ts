import { canonicalJsonStringify } from '@trapmap/lib/canonical-json.js';
import { sha256 } from '@trapmap/lib/hash.js';
import { cosineSimilarity, normalizeVector } from '@trapmap/lib/vector.js';
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

export async function normalizeWithFallback(vector: number[]): Promise<number[]> {
  // normalize is pure and fast; JS is sufficient, but keep hook for future Go path
  return normalizeVector(vector);
}
