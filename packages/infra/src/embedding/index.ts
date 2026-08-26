import { createDeterministicFallbackVector } from '@trapmap/lib';

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
  return createFallbackEmbedding(text);
}
