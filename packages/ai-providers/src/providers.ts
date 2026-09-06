import { createDeterministicFallbackVector } from '@trapmap/lib';

import {
  type EmbeddingModelConfig,
  embedBatch,
  embedSingle,
  generateChatText,
  type ResolvedChatModel,
  type ResolvedEmbeddingModel,
  resolveChatModel,
  resolveEmbeddingModel,
  toEmbeddingConfig,
} from './adapters/aisdk.js';
import type { AiProviderConfig } from './provider-config.js';
import type { AiPromptBlock, AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';

/** AI SDK-backed embeddings. Single `embed`/`embedMany` path for all providers. */
export class AiSdkEmbeddings implements EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  readonly model: string | null;
  private resolved: ResolvedEmbeddingModel | null = null;
  private readonly embConfig: EmbeddingModelConfig;
  private readonly configured: boolean;

  constructor(config: AiProviderConfig | EmbeddingModelConfig, opts?: { model?: string }) {
    if ('embeddingModel' in config) {
      this.embConfig = toEmbeddingConfig(config);
      this.provider = config.provider;
      this.model = config.embeddingModel || opts?.model || null;
      this.configured = config.isConfigured;
    } else {
      this.embConfig = config;
      this.provider = config.provider;
      this.model = config.model || null;
      this.configured =
        config.baseUrl.length > 0 && config.apiKey.length > 0 && config.model.length > 0;
    }
    this.isConfigured = this.configured;
  }

  private ensureResolved(): ResolvedEmbeddingModel {
    if (!this.resolved) {
      this.resolved = resolveEmbeddingModel(this.embConfig);
    }
    return this.resolved;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isConfigured) {
      throw new Error(`Embeddings not configured (provider=${this.provider})`);
    }
    return embedSingle(this.ensureResolved(), text);
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured) {
      throw new Error(`Embeddings not configured (provider=${this.provider})`);
    }
    if (texts.length === 0) return [];
    return embedBatch(this.ensureResolved(), texts);
  }
}

/** Legacy alias kept for staged migration; delegates to {@link AiSdkEmbeddings}. */
export class OpenAICompatibleEmbeddings extends AiSdkEmbeddings {}

/** Legacy Google path now unified on AI SDK (no bespoke fetch). */
export class GoogleGenAIEmbeddings extends AiSdkEmbeddings {
  override async embed(text: string): Promise<number[]> {
    if (!this.isConfigured) {
      throw new Error('Google GenAI embeddings not configured. Set GEMINI_API_KEY or AI_API_KEY.');
    }
    return super.embed(text);
  }
}

export class FallbackEmbeddings implements EmbeddingsProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;
  readonly model = null;

  async embed(text: string): Promise<number[]> {
    return createDeterministicFallbackVector(text, 384);
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

/** AI SDK-backed chat. Single `generateText` path for all providers. */
export class AiSdkChat implements ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  readonly model: string;
  private resolved: ResolvedChatModel | null = null;
  private readonly chatConfig: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.provider = config.provider;
    this.isConfigured = config.isConfigured;
    this.model = config.chatModel;
    this.chatConfig = config;
  }

  private ensureResolved(): ResolvedChatModel {
    if (!this.resolved) {
      this.resolved = resolveChatModel(this.chatConfig);
    }
    return this.resolved;
  }

  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('No AI chat provider configured. Set AI_PROVIDER or OPENAI_API_KEY.');
    }
    return generateChatText({
      resolved: this.ensureResolved(),
      system: systemPrompt,
      prompt: userMessage,
    });
  }

  async invokeWithTemperature(
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('No AI chat provider configured. Set AI_PROVIDER or OPENAI_API_KEY.');
    }
    return generateChatText({
      resolved: this.ensureResolved(),
      system: systemPrompt,
      prompt: userMessage,
      temperature,
    });
  }

  async invokeWithBlocks(blocks: AiPromptBlock[], userMessage: string): Promise<string> {
    return this.invoke(blocks.map((block) => block.content).join('\n'), userMessage);
  }
}

/** Legacy alias kept for staged migration; delegates to {@link AiSdkChat}. */
export class OpenAICompatibleChat extends AiSdkChat {}

export class FallbackChat implements ChatProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;

  async invoke(): Promise<string> {
    throw new Error('No AI chat provider configured. Set AI_PROVIDER or OPENAI_API_KEY.');
  }
}

export function createAiProviders(config: AiProviderConfig): AiProviders {
  if (config.provider === 'fallback') {
    return { embeddings: new FallbackEmbeddings(), chat: new FallbackChat() };
  }

  const createEmbeddingsProvider = (providerConfig: AiProviderConfig): EmbeddingsProvider =>
    new AiSdkEmbeddings(providerConfig);

  if (config.embeddingProvider?.isConfigured) {
    const embeddingProviderConfig: EmbeddingModelConfig = {
      provider: config.embeddingProvider.provider,
      baseUrl: config.embeddingProvider.baseUrl,
      apiKey: config.embeddingProvider.apiKey,
      model: config.embeddingProvider.model,
    };
    return {
      embeddings: new AiSdkEmbeddings(embeddingProviderConfig),
      chat: new AiSdkChat(config),
    };
  }

  return {
    embeddings: createEmbeddingsProvider(config),
    chat: new AiSdkChat(config),
  };
}
