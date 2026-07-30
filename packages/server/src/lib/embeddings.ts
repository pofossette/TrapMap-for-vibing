import { createHash } from 'node:crypto';
import {
  createAiProviders,
  loadAiProviderConfig,
  type EmbeddingsProvider,
} from '@trapmap/ai-providers';

/**
 * Global provider bridge: when set, generateEmbedding() delegates here
 * instead of using the cached adapter logic. This lets the new AI provider
 * layer coexist with existing callers that use generateEmbedding() directly.
 */
let globalProvider: EmbeddingsProvider | null = null;

export function setGlobalEmbeddingsProvider(p: EmbeddingsProvider): void {
  globalProvider = p;
}

/**
 * Create a deterministic hash for embedding text to detect cache hits.
 * Uses SHA-256 and returns a hex string.
 */
export function hashEmbeddingText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

let cachedAdapter: EmbeddingsProvider | null = null;

function getFallbackAdapter(): EmbeddingsProvider {
  return (cachedAdapter ??= createAiProviders(loadAiProviderConfig()).embeddings);
}

export async function getEmbeddingsAdapter(): Promise<EmbeddingsProvider> {
  return globalProvider ?? getFallbackAdapter();
}

/**
 * Embedding result with timing metadata.
 */
// fallow-ignore-next-line unused-type
export interface EmbeddingResult {
  vector: number[];
  latencyMs: number;
  provider: string;
  cached: boolean;
}

/**
 * Generate an embedding vector with timing metadata.
 * Returns both the vector and performance info for observability.
 *
 * @param text - Text to embed
 * @returns Embedding result with vector, latency, provider, and cache status
 */
async function generateEmbeddingWithMeta(text: string): Promise<EmbeddingResult> {
  const t0 = performance.now();

  if (globalProvider) {
    try {
      const vector = await globalProvider.embed(text);
      return {
        vector,
        latencyMs: performance.now() - t0,
        provider: globalProvider.provider ?? 'global',
        cached: false,
      };
    } catch {
      // fall through to legacy adapter
    }
  }

  const adapter = getFallbackAdapter();
  const vector = await adapter.embed(text);
  return {
    vector,
    latencyMs: performance.now() - t0,
    provider: adapter.provider,
    cached: false,
  };
}

/**
 * Generate an embedding vector for text using the configured provider.
 * This is the main entry point for embedding generation.
 *
 * If the global provider fails (e.g. endpoint does not support embeddings),
 * falls back to the shared provider factory's deterministic local adapter.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingWithMeta(text);
  return result.vector;
}
