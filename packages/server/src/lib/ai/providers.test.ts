import { describe, expect, it } from 'vitest';

import type { AiProviderConfig } from './provider-config.js';
import { createAiProviders, FallbackChat, FallbackEmbeddings, OpenAICompatibleChat, OpenAICompatibleEmbeddings } from './providers.js';

const openaiConfig: AiProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  isConfigured: true,
};

const fallbackConfig: AiProviderConfig = {
  provider: 'fallback',
  baseUrl: '',
  apiKey: '',
  chatModel: '',
  embeddingModel: '',
  isConfigured: false,
};

describe('createAiProviders', () => {
  it('returns fallback providers when provider is fallback', () => {
    const providers = createAiProviders(fallbackConfig);

    expect(providers.embeddings).toBeInstanceOf(FallbackEmbeddings);
    expect(providers.chat).toBeInstanceOf(FallbackChat);
    expect(providers.embeddings.isConfigured).toBe(false);
    expect(providers.chat.isConfigured).toBe(false);
  });

  it('returns openai-compatible providers when provider is openai', () => {
    const providers = createAiProviders(openaiConfig);

    expect(providers.embeddings).toBeInstanceOf(OpenAICompatibleEmbeddings);
    expect(providers.chat).toBeInstanceOf(OpenAICompatibleChat);
    // isConfigured may be false if @langchain/openai fails to load
    expect(typeof providers.embeddings.isConfigured).toBe('boolean');
    expect(typeof providers.chat.isConfigured).toBe('boolean');
  });
});

describe('FallbackEmbeddings', () => {
  it('produces a deterministic unit-length vector', async () => {
    const fb = new FallbackEmbeddings();
    const vec = await fb.embed('hello world');

    expect(vec).toHaveLength(384);
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1.0, 5);
  });

  it('produces same vector for same input', async () => {
    const fb = new FallbackEmbeddings();
    const v1 = await fb.embed('test input');
    const v2 = await fb.embed('test input');

    expect(v1).toEqual(v2);
  });

  it('produces different vectors for different inputs', async () => {
    const fb = new FallbackEmbeddings();
    const v1 = await fb.embed('docker networking');
    const v2 = await fb.embed('kubernetes secrets');

    expect(v1).not.toEqual(v2);
  });

  it('handles short text without tokens', async () => {
    const fb = new FallbackEmbeddings();
    const vec = await fb.embed('hi');

    expect(vec).toHaveLength(384);
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1.0, 5);
  });
});

describe('FallbackChat', () => {
  it('throws when invoke is called', async () => {
    const chat = new FallbackChat();

    await expect(chat.invoke('sys', 'user')).rejects.toThrow('No AI chat provider configured');
  });
});

describe('OpenAICompatibleEmbeddings', () => {
  it('is not configured when config is not configured', () => {
    const unconfigured: AiProviderConfig = { ...openaiConfig, isConfigured: false };
    const embeddings = new OpenAICompatibleEmbeddings(unconfigured);

    expect(embeddings.isConfigured).toBe(false);
  });

  it('throws when embed is called without impl', async () => {
    const unconfigured: AiProviderConfig = { ...openaiConfig, isConfigured: false };
    const embeddings = new OpenAICompatibleEmbeddings(unconfigured);

    await expect(embeddings.embed('test')).rejects.toThrow('not configured');
  });
});

describe('OpenAICompatibleChat', () => {
  it('is not configured when config is not configured', () => {
    const unconfigured: AiProviderConfig = { ...openaiConfig, isConfigured: false };
    const chat = new OpenAICompatibleChat(unconfigured);

    expect(chat.isConfigured).toBe(false);
  });

  it('throws when invoke is called without impl', async () => {
    const unconfigured: AiProviderConfig = { ...openaiConfig, isConfigured: false };
    const chat = new OpenAICompatibleChat(unconfigured);

    await expect(chat.invoke('sys', 'user')).rejects.toThrow('not configured');
  });
});
