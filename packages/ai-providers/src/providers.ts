import { createDeterministicFallbackVector } from '@trapmap/lib';
import type { AiProviderConfig } from './provider-config.js';
import type { AiPromptBlock, AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';

export class OpenAICompatibleEmbeddings implements EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  private impl: import('@langchain/openai').OpenAIEmbeddings | null = null;
  private readonly embConfig: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.provider = config.provider;
    this.isConfigured = config.isConfigured;
    this.embConfig = config;
  }

  private async ensureImpl(): Promise<import('@langchain/openai').OpenAIEmbeddings> {
    if (!this.impl) {
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      this.impl = new OpenAIEmbeddings({
        modelName: this.embConfig.embeddingModel,
        apiKey: this.embConfig.apiKey,
        timeout: 30_000,
        configuration: { baseURL: this.embConfig.baseUrl },
      });
    }
    return this.impl;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.ensureImpl()).embedQuery(text);
  }
}

export class GoogleGenAIEmbeddings implements EmbeddingsProvider {
  readonly provider = 'google-genai';
  readonly isConfigured: boolean;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: AiProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.embeddingModel;
    this.isConfigured = config.isConfigured && this.apiKey.length > 0 && this.model.length > 0;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isConfigured) {
      throw new Error('Google GenAI embeddings not configured. Set GEMINI_API_KEY or AI_API_KEY.');
    }

    const response = await fetch(`${this.baseUrl}/models/${this.model}:embedContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Google GenAI embeddings API error: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as { embedding?: { values?: number[] } };
    if (!data.embedding?.values || !Array.isArray(data.embedding.values)) {
      throw new Error('Google GenAI embeddings API returned invalid response');
    }
    return data.embedding.values;
  }
}

export class FallbackEmbeddings implements EmbeddingsProvider {
  readonly provider = 'fallback';
  readonly isConfigured = false;

  async embed(text: string): Promise<number[]> {
    return createDeterministicFallbackVector(text, 384);
  }
}

export class OpenAICompatibleChat implements ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  readonly model: string;
  private impl: import('@langchain/openai').ChatOpenAI | null = null;
  private readonly chatConfig: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.provider = config.provider;
    this.isConfigured = config.isConfigured;
    this.model = config.chatModel;
    this.chatConfig = config;
  }

  private async ensureImpl(): Promise<import('@langchain/openai').ChatOpenAI> {
    if (!this.impl) {
      const { ChatOpenAI } = await import('@langchain/openai');
      this.impl = new ChatOpenAI({
        modelName: this.chatConfig.chatModel,
        apiKey: this.chatConfig.apiKey,
        timeout: 30_000,
        configuration: { baseURL: this.chatConfig.baseUrl },
      });
    }
    return this.impl;
  }

  async invoke(systemPrompt: string, userMessage: string): Promise<string> {
    const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
    const result = await (await this.ensureImpl()).invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);
    return typeof result.content === 'string' ? result.content : String(result.content);
  }

  async invokeWithTemperature(
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<string> {
    const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');
    const { ChatOpenAI } = await import('@langchain/openai');
    const result = await new ChatOpenAI({
      modelName: this.chatConfig.chatModel,
      apiKey: this.chatConfig.apiKey,
      timeout: 30_000,
      temperature,
      configuration: { baseURL: this.chatConfig.baseUrl },
    }).invoke([new SystemMessage(systemPrompt), new HumanMessage(userMessage)]);
    return typeof result.content === 'string' ? result.content : String(result.content);
  }

  async invokeWithBlocks(blocks: AiPromptBlock[], userMessage: string): Promise<string> {
    return this.invoke(blocks.map((block) => block.content).join('\n'), userMessage);
  }
}

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
    providerConfig.provider === 'google-genai'
      ? new GoogleGenAIEmbeddings(providerConfig)
      : new OpenAICompatibleEmbeddings(providerConfig);

  if (config.embeddingProvider?.isConfigured) {
    const embeddingProviderConfig: AiProviderConfig = {
      provider: config.embeddingProvider.provider,
      baseUrl: config.embeddingProvider.baseUrl,
      apiKey: config.embeddingProvider.apiKey,
      chatModel: '',
      embeddingModel: config.embeddingProvider.model,
      isConfigured: true,
      promptTemplateFile: null,
    };
    return {
      embeddings: createEmbeddingsProvider(embeddingProviderConfig),
      chat: new OpenAICompatibleChat(config),
    };
  }

  return {
    embeddings: createEmbeddingsProvider(config),
    chat: new OpenAICompatibleChat(config),
  };
}
