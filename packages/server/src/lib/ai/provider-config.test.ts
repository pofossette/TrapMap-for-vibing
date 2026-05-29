import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadAiProviderConfig } from './provider-config.js';

// Save and restore env vars between tests
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

  it('returns fallback when no env vars are set', () => {
    const config = loadAiProviderConfig();

    expect(config.provider).toBe('fallback');
    expect(config.isConfigured).toBe(false);
    expect(config.baseUrl).toBe('');
    expect(config.apiKey).toBe('');
  });

  it('auto-detects openai from OPENAI_API_KEY (backward compat)', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-test-key');
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.chatModel).toBe('gpt-4o-mini');
    expect(config.embeddingModel).toBe('text-embedding-3-small');
    expect(config.isConfigured).toBe(true);
  });

  it('uses AI_PROVIDER=openai explicitly', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-explicit-key';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-explicit-key');
    expect(config.isConfigured).toBe(true);
  });

  it('uses ollama defaults', () => {
    process.env.AI_PROVIDER = 'ollama';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('ollama');
    expect(config.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.apiKey).toBe('ollama');
    expect(config.chatModel).toBe('llama3');
    expect(config.embeddingModel).toBe('nomic-embed-text');
    expect(config.isConfigured).toBe(true);
  });

  it('uses openai-compatible with manual overrides', () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_BASE_URL = 'https://my-api.example.com/v1';
    process.env.AI_API_KEY = 'my-secret';
    process.env.AI_CHAT_MODEL = 'my-model';
    process.env.AI_EMBEDDING_MODEL = 'my-embed';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('openai-compatible');
    expect(config.baseUrl).toBe('https://my-api.example.com/v1');
    expect(config.apiKey).toBe('my-secret');
    expect(config.chatModel).toBe('my-model');
    expect(config.embeddingModel).toBe('my-embed');
    expect(config.isConfigured).toBe(true);
  });

  it('openai-compatible without overrides is not configured', () => {
    process.env.AI_PROVIDER = 'openai-compatible';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('openai-compatible');
    expect(config.isConfigured).toBe(false);
  });

  it('AI_PROVIDER takes precedence over OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AI_PROVIDER = 'ollama';

    const config = loadAiProviderConfig();

    expect(config.provider).toBe('ollama');
    expect(config.apiKey).toBe('ollama');
  });

  it('AI_BASE_URL overrides provider default', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-test';
    process.env.AI_BASE_URL = 'https://custom.openai.com/v1';

    const config = loadAiProviderConfig();

    expect(config.baseUrl).toBe('https://custom.openai.com/v1');
  });

  it('AI_CHAT_MODEL overrides provider default', () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.AI_CHAT_MODEL = 'mistral';

    const config = loadAiProviderConfig();

    expect(config.chatModel).toBe('mistral');
  });

  it('AI_EMBEDDING_MODEL overrides provider default', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-test';
    process.env.AI_EMBEDDING_MODEL = 'text-embedding-3-large';

    const config = loadAiProviderConfig();

    expect(config.embeddingModel).toBe('text-embedding-3-large');
  });

  it('openai provider falls back to OPENAI_API_KEY when AI_API_KEY not set', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-from-openai-var';

    const config = loadAiProviderConfig();

    expect(config.apiKey).toBe('sk-from-openai-var');
  });

  it('OPENAI_API_KEY takes precedence over AI_API_KEY for openai provider', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-new';
    process.env.OPENAI_API_KEY = 'sk-old';

    const config = loadAiProviderConfig();

    expect(config.apiKey).toBe('sk-old');
  });

  it('OPENAI_API_KEY takes precedence over AI_API_KEY for openai provider (fm-agent fix)', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'wrong-key-from-ai-api-key';
    process.env.OPENAI_API_KEY = 'correct-key-from-openai-api-key';

    const config = loadAiProviderConfig();

    expect(config.apiKey).toBe('correct-key-from-openai-api-key');
  });

  it('GEMINI_API_KEY takes precedence over AI_API_KEY for google-genai (fm-agent fix)', () => {
    process.env.AI_PROVIDER = 'google-genai';
    process.env.AI_API_KEY = 'wrong-ai-key';
    process.env.GEMINI_API_KEY = 'correct-gemini-key';

    const config = loadAiProviderConfig();

    expect(config.apiKey).toBe('correct-gemini-key');
    expect(config.provider).toBe('google-genai');
  });

  it('invalid AI_PROVIDER value falls through to auto-detect', () => {
    process.env.AI_PROVIDER = 'invalid';

    // No OPENAI_API_KEY either, so should be fallback
    const config = loadAiProviderConfig();

    expect(config.provider).toBe('fallback');
  });

  it('openai provider without any key is not configured', () => {
    process.env.AI_PROVIDER = 'openai';

    const config = loadAiProviderConfig();

    expect(config.isConfigured).toBe(false);
  });

  it('empty AI_PROMPT_TEMPLATE_FILE is treated as null', () => {
    process.env.AI_PROMPT_TEMPLATE_FILE = '';
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-test';

    const config = loadAiProviderConfig();

    expect(config.promptTemplateFile).toBeNull();
  });
});
