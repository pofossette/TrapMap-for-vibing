import { createDeterministicFallbackVector } from '@trapmap/lib';
import { getGoAcceleratorClient } from '../go-accelerator/client.js';
import { deterministicFallbackWithFallback } from '../go-accelerator/fallback.js';

export const FALLBACK_EMBEDDING_DIMENSION = 384 as const;
export const EXPERIENCE_GENE_FALLBACK_MODEL_VERSION = 'experience-gene-fallback-v1' as const;

/**
 * Create a deterministic fallback embedding for a given text.
 * Thin wrapper around `@trapmap/lib::createDeterministicFallbackVector`
 * that freezes the default dimension (384) and model version used by
 * experience-gene projections.
 */
export function createFallbackEmbedding(
  text: string,
  dimension = FALLBACK_EMBEDDING_DIMENSION,
): number[] {
  return createDeterministicFallbackVector(text, dimension);
}

/**
 * Validate that an embedding has the expected dimension and finite values.
 */
export function assertValidEmbedding(
  vector: number[],
  expectedDimension = FALLBACK_EMBEDDING_DIMENSION,
): void {
  if (vector.length !== expectedDimension) {
    throw new Error(`embedding must contain ${expectedDimension} finite values`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`embedding must contain ${expectedDimension} finite values`);
  }
}

/**
 * Async embed helper that returns a deterministic fallback vector.
 * Suitable as the default `embed` implementation for gene search ports
 * when no external provider is configured.
 */
export async function embedWithFallback(text: string): Promise<number[]> {
  const client = getGoAcceleratorClient();
  if (client.isEnabled) {
    try {
      return await deterministicFallbackWithFallback(text, FALLBACK_EMBEDDING_DIMENSION, client);
    } catch {
      // fall through to local
    }
  }
  return createFallbackEmbedding(text);
}

/**
 * Go-accelerated variant for service layers that already hold a client.
 * Keeps host-local zero-Go: when client is disabled it falls back to JS.
 */
export async function embedWithFallbackAndClient(
  text: string,
  client: ReturnType<typeof getGoAcceleratorClient> | null,
  dimension = FALLBACK_EMBEDDING_DIMENSION,
): Promise<number[]> {
  if (client?.isEnabled) {
    try {
      return await deterministicFallbackWithFallback(text, dimension, client);
    } catch {}
  }
  return createFallbackEmbedding(text, dimension);
}
