/**
 * AI provider implementations.
 * All providers use @langchain/openai, differing only in baseURL and apiKey.
 * Ollama's /v1/* endpoints are OpenAI-compatible, so no separate package is needed.
 */

import type { AiProviderConfig } from './provider-config.js';
import type { AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';

// ---------------------------------------------------------------------------
// Embeddings providers
// ---------------------------------------------------------------------------

/**
 * OpenAI-compatible embeddings provider.
 * Works with OpenAI, Azure OpenAI, Ollama, and any OpenAI-compatible API.
 */
export class OpenAICompatibleEmbeddings implements EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  private impl: import('@langchain/openai').OpenAIEmbeddings | null = null;

  constructor(config: AiProviderConfig) {
    this.provider = config.provider;
    this.isConfigured = config.isConfigured;

    if (this.isConfigured) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OpenAIEmbeddings } = require('@langchain/openai');
        this.impl = new OpenAIEmbeddings({
          modelName: config.embeddingModel,
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl,
          },
        });
      } catch {
        this.isConfigured = false;
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.impl) {
      throw new Error(`${this.provider} embeddings not configured`);
    }
    return this.impl.embedQuery(text);
  }
}

/**
 * Deterministic hash-vector fallback for when no provider is configured.
 * Migrated from embeddings.ts — identical algorithm for backward compat.
 */
export class FallbackEmbeddings implements EmbeddingsProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;
  private readonly dimension = 384;

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0);
    const normalizedText = text.toLowerCase().trim();

    const tokens = normalizedText.split(/\s+/).filter((t) => t.length > 2);

    if (tokens.length > 0) {
      for (const token of tokens) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
          hash = (hash * 31 + token.charCodeAt(i)) | 0;
        }

        for (let j = 0; j < 6; j++) {
          const idx = Math.abs(hash) % this.dimension;
          vector[idx] += j < 3 ? 1.0 : -0.5;
          hash = (hash * 1103515245 + 12345) | 0;
        }
      }
    } else {
      let seed = 0;
      for (let i = 0; i < normalizedText.length; i++) {
        seed = (seed * 31 + normalizedText.charCodeAt(i)) | 0;
      }
      for (let i = 0; i < this.dimension; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        vector[i] = (seed % 10000) / 5000 - 1;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}

// ---------------------------------------------------------------------------
// Chat providers
// ---------------------------------------------------------------------------

/**
 * OpenAI-compatible chat provider.
 * Works with OpenAI, Azure OpenAI, Ollama, and any OpenAI-compatible API.
 */
export class OpenAICompatibleChat implements ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  private impl: import('@langchain/openai').ChatOpenAI | null = null;

  constructor(config: AiProviderConfig) {
    this.provider = config.provider;
    this.isConfigured = config.isConfigured;

    if (this.isConfigured) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        this.impl = new ChatOpenAI({
          modelName: config.chatModel,
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl,
          },
        });
      } catch {
        this.isConfigured = false;
      }
    }
  }

  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    if (!this.impl) {
      throw new Error(`${this.provider} chat not configured`);
    }
    const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
    const result = await this.impl.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);
    return typeof result.content === 'string' ? result.content : String(result.content);
  }
}

/**
 * Fallback chat provider — throws when no provider is configured.
 */
export class FallbackChat implements ChatProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;

  async invoke(): Promise<string> {
    throw new Error('No AI chat provider configured. Set AI_PROVIDER or OPENAI_API_KEY.');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create AI providers from configuration.
 * Returns live providers when configured, otherwise deterministic fallbacks.
 */
export function createAiProviders(config: AiProviderConfig): AiProviders {
  if (config.provider === 'fallback') {
    return {
      embeddings: new FallbackEmbeddings(),
      chat: new FallbackChat(),
    };
  }

  return {
    embeddings: new OpenAICompatibleEmbeddings(config),
    chat: new OpenAICompatibleChat(config),
  };
}
