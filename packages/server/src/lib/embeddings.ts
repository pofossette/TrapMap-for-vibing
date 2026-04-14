import { createHash } from 'node:crypto';

interface EmbeddingsAdapter {
  provider: string;
  isConfigured: boolean;
  embed: (text: string) => Promise<number[]>;
}

/**
 * Create a deterministic hash for embedding text to detect cache hits.
 * Uses SHA-256 and returns a hex string.
 */
export function hashEmbeddingText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Fallback embeddings provider that produces deterministic vectors
 * when no live provider is configured. This allows local and CI environments
 * to continue working without API keys.
 */
class FallbackEmbeddings implements EmbeddingsAdapter {
  readonly provider = 'fallback';
  readonly isConfigured = false;
  private readonly dimension = 384; // Common embedding dimension (e.g., all-MiniLM-L6-v2)

  /**
   * Generate a deterministic embedding vector from text.
   * Uses character codes and position weights to create stable vectors.
   */
  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0);
    const normalizedText = text.toLowerCase().trim();

    // Create a deterministic seed from the text
    let seed = 0;
    for (let i = 0; i < normalizedText.length; i++) {
      seed = (seed * 31 + normalizedText.charCodeAt(i)) | 0;
    }

    // Generate vector using seeded pseudo-random values
    for (let i = 0; i < this.dimension; i++) {
      // Simple deterministic pseudo-random number generator
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      vector[i] = (seed % 10000) / 5000 - 1; // Map to [-1, 1]
    }

    // Normalize to unit length for cosine similarity
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}

/**
 * OpenAI-backed embeddings provider using LangChain.
 * Only active when OPENAI_API_KEY is configured.
 */
class OpenAIEmbeddings implements EmbeddingsAdapter {
  readonly provider = 'openai';
  readonly isConfigured: boolean;
  private impl: import('@langchain/openai').OpenAIEmbeddings | null = null;

  constructor() {
    this.isConfigured =
      typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0;

    if (this.isConfigured) {
      // Lazy import to avoid requiring the key at module load time
      try {
        const { OpenAIEmbeddings } = require('@langchain/openai');
        this.impl = new OpenAIEmbeddings({
          modelName: 'text-embedding-3-small',
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      } catch {
        this.isConfigured = false;
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.impl) {
      throw new Error('OpenAI embeddings not configured');
    }

    const result = await this.impl.embedQuery(text);
    return result;
  }
}

/**
 * Provider-agnostic embeddings adapter factory.
 * Returns a live provider when configured, otherwise a deterministic fallback.
 */
let cachedAdapter: EmbeddingsAdapter | null = null;

export async function getEmbeddingsAdapter(): Promise<EmbeddingsAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  // Try OpenAI if configured
  const hasOpenAIKey =
    typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0;

  if (hasOpenAIKey) {
    cachedAdapter = new OpenAIEmbeddings();
    if (cachedAdapter.isConfigured) {
      return cachedAdapter;
    }
  }

  // Fall back to deterministic vectors for local/CI
  cachedAdapter = new FallbackEmbeddings();
  return cachedAdapter;
}

/**
 * Generate an embedding vector for text using the configured provider.
 * This is the main entry point for embedding generation.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const adapter = await getEmbeddingsAdapter();
  return adapter.embed(text);
}
