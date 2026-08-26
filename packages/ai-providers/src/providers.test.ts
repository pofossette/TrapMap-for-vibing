import { createDeterministicFallbackVector } from '@trapmap/lib';
import { describe, expect, it, vi } from 'vitest';

import type { AiProviderConfig } from './provider-config.js';
import {
  FallbackChat,
  FallbackEmbeddings,
  GoogleGenAIEmbeddings,
  OpenAICompatibleChat,
  OpenAICompatibleEmbeddings,
  createAiProviders,
} from './providers.js';

vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn().mockImplementation(() => ({
    embedQuery: vi.fn().mockRejectedValue(new Error('Invalid or inaccessible API endpoint')),
  })),
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockRejectedValue(new Error('Invalid or inaccessible API endpoint')),
  })),
}));

const openaiConfig: AiProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  isConfigured: true,
  promptTemplateFile: null,
};

const googleConfig: AiProviderConfig = {
  provider: 'google-genai',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'test-api-key',
  chatModel: 'gemini-2.0-flash',
  embeddingModel: 'text-embedding-004',
  isConfigured: true,
  promptTemplateFile: null,
};

const fallbackConfig: AiProviderConfig = {
  provider: 'fallback',
  baseUrl: '',
  apiKey: '',
  chatModel: '',
  embeddingModel: '',
  isConfigured: false,
  promptTemplateFile: null,
};

describe('createAiProviders', () => {
  it('returns deterministic fallback providers when the provider is fallback', () => {
    const providers = createAiProviders(fallbackConfig);

    expect(providers.embeddings).toBeInstanceOf(FallbackEmbeddings);
    expect(providers.chat).toBeInstanceOf(FallbackChat);
  });

  it('uses OpenAI-compatible providers for OpenAI', () => {
    const providers = createAiProviders(openaiConfig);

    expect(providers.embeddings).toBeInstanceOf(OpenAICompatibleEmbeddings);
    expect(providers.chat).toBeInstanceOf(OpenAICompatibleChat);
  });

  it('uses Google GenAI embeddings and OpenAI-compatible chat for Google', () => {
    const providers = createAiProviders(googleConfig);

    expect(providers.embeddings).toBeInstanceOf(GoogleGenAIEmbeddings);
    expect(providers.chat).toBeInstanceOf(OpenAICompatibleChat);
  });

  it('uses a configured embedding override independently of primary chat', () => {
    const providers = createAiProviders({
      ...openaiConfig,
      embeddingProvider: {
        provider: 'google-genai',
        baseUrl: googleConfig.baseUrl,
        apiKey: googleConfig.apiKey,
        model: googleConfig.embeddingModel,
        isConfigured: true,
      },
    });

    expect(providers.embeddings).toBeInstanceOf(GoogleGenAIEmbeddings);
    expect(providers.chat).toBeInstanceOf(OpenAICompatibleChat);
  });
});

describe('FallbackEmbeddings', () => {
  it('produces deterministic unit-length vectors', async () => {
    const embeddings = new FallbackEmbeddings();
    const first = await embeddings.embed('hello world');
    const second = await embeddings.embed('hello world');

    expect(first).toHaveLength(384);
    expect(first).toEqual(second);
    expect(Math.sqrt(first.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
  });

  it('matches the shared deterministic vector implementation', async () => {
    const embeddings = new FallbackEmbeddings();

    await expect(embeddings.embed('hello world')).resolves.toEqual(
      createDeterministicFallbackVector('hello world', 384),
    );
  });
});

describe('FallbackChat', () => {
  it('throws when invoked', async () => {
    await expect(new FallbackChat().invoke('system', 'user')).rejects.toThrow(
      'No AI chat provider configured',
    );
  });
});

describe('OpenAI-compatible providers', () => {
  it('exposes the configured chat model for structured generation provenance', () => {
    const chat = new OpenAICompatibleChat(openaiConfig);

    expect(chat.model).toBe(openaiConfig.chatModel);
  });

  it('propagates lazy OpenAI embedding failures', async () => {
    await expect(new OpenAICompatibleEmbeddings(openaiConfig).embed('test')).rejects.toThrow();
  });

  it('accepts server-shaped blocks when invoking chat', async () => {
    await expect(
      new OpenAICompatibleChat(openaiConfig).invokeWithBlocks([{ content: 'block' }], 'user'),
    ).rejects.toThrow();
  });
});

describe('GoogleGenAIEmbeddings', () => {
  it('reports missing Google configuration before making a request', async () => {
    const embeddings = new GoogleGenAIEmbeddings({ ...googleConfig, apiKey: '' });

    expect(embeddings.isConfigured).toBe(false);
    await expect(embeddings.embed('test')).rejects.toThrow(
      'Google GenAI embeddings not configured',
    );
  });
});
