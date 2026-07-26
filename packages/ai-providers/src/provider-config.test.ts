import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadAiProviderConfig } from './provider-config.js';

const ENV_KEYS = [
  'AI_PROVIDER',
  'AI_BASE_URL',
  'AI_API_KEY',
  'AI_CHAT_MODEL',
  'AI_EMBEDDING_MODEL',
  'EMBEDDING_PROVIDER',
  'EMBEDDING_BASE_URL',
  'EMBEDDING_API_KEY',
  'EMBEDDING_MODEL',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'AI_PROMPT_TEMPLATE_FILE',
] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    Reflect.deleteProperty(process.env, key);
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] !== undefined) {
      process.env[key] = saved[key];
    } else {
      Reflect.deleteProperty(process.env, key);
    }
  }
}

describe('loadAiProviderConfig', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns fallback when no environment variables are set', () => {
    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'fallback',
      isConfigured: false,
      baseUrl: '',
      apiKey: '',
    });
  });

  it('auto-detects OpenAI from OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';

    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
      chatModel: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      isConfigured: true,
    });
  });

  it('uses explicit provider defaults and overrides', () => {
    process.env.AI_PROVIDER = 'ollama';
    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      chatModel: 'llama3',
      embeddingModel: 'nomic-embed-text',
      isConfigured: true,
    });

    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_BASE_URL = 'https://my-api.example.com/v1';
    process.env.AI_API_KEY = 'my-secret';
    process.env.AI_CHAT_MODEL = 'my-model';
    process.env.AI_EMBEDDING_MODEL = 'my-embed';
    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'openai-compatible',
      baseUrl: 'https://my-api.example.com/v1',
      apiKey: 'my-secret',
      chatModel: 'my-model',
      embeddingModel: 'my-embed',
      isConfigured: true,
    });
  });

  it('uses AI_PROVIDER ahead of auto-detection', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AI_PROVIDER = 'ollama';

    expect(loadAiProviderConfig()).toMatchObject({ provider: 'ollama', apiKey: 'ollama' });
  });

  it('gives OPENAI_API_KEY precedence over AI_API_KEY for OpenAI', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'wrong-key';
    process.env.OPENAI_API_KEY = 'correct-key';

    expect(loadAiProviderConfig().apiKey).toBe('correct-key');
  });

  it('gives GEMINI_API_KEY precedence over AI_API_KEY for Google GenAI', () => {
    process.env.AI_PROVIDER = 'google-genai';
    process.env.AI_API_KEY = 'wrong-key';
    process.env.GEMINI_API_KEY = 'correct-key';

    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'google-genai',
      apiKey: 'correct-key',
    });
  });

  it('falls back to Google GenAI when only GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'gemini-key';

    expect(loadAiProviderConfig()).toMatchObject({
      provider: 'google-genai',
      apiKey: 'gemini-key',
    });
  });

  it('does not configure an OpenAI-compatible provider without overrides', () => {
    process.env.AI_PROVIDER = 'openai-compatible';

    expect(loadAiProviderConfig().isConfigured).toBe(false);
  });

  it('configures a separate embedding provider', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-primary';
    process.env.EMBEDDING_PROVIDER = 'ollama';
    process.env.EMBEDDING_BASE_URL = 'http://embedding-host/v1';
    process.env.EMBEDDING_API_KEY = 'embedding-key';
    process.env.EMBEDDING_MODEL = 'embedding-model';

    expect(loadAiProviderConfig().embeddingProvider).toEqual({
      provider: 'ollama',
      baseUrl: 'http://embedding-host/v1',
      apiKey: 'embedding-key',
      model: 'embedding-model',
      isConfigured: true,
    });
  });

  it('treats an empty prompt template file value as null', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-test';
    process.env.AI_PROMPT_TEMPLATE_FILE = '';

    expect(loadAiProviderConfig().promptTemplateFile).toBeNull();
  });
});
