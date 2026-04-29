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
   * Uses token-aware hashing so texts with shared tokens produce
   * higher cosine similarity. Falls back to character-level hashing
   * for short texts with no extractable tokens.
   */
  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0);
    const normalizedText = text.toLowerCase().trim();

    // Extract tokens (words longer than 2 chars) for token-aware embedding
    const tokens = normalizedText
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (tokens.length > 0) {
      // Each token contributes a positive value to a deterministic set of dimensions.
      // Shared tokens between two texts will overlap in the same dimensions,
      // producing higher cosine similarity for related content.
      for (const token of tokens) {
        // Hash token to a set of dimension indices (3 per token for spread)
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
          hash = (hash * 31 + token.charCodeAt(i)) | 0;
        }

        for (let j = 0; j < 3; j++) {
          const idx = Math.abs(hash) % this.dimension;
          vector[idx] += 1.0;
          hash = (hash * 1103515245 + 12345) | 0;
        }
      }
    } else {
      // Fallback for very short text with no extractable tokens
      let seed = 0;
      for (let i = 0; i < normalizedText.length; i++) {
        seed = (seed * 31 + normalizedText.charCodeAt(i)) | 0;
      }
      for (let i = 0; i < this.dimension; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        vector[i] = (seed % 10000) / 5000 - 1;
      }
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
