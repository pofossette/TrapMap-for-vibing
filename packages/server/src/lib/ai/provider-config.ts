/**
 * AI provider configuration.
 * Follows the same sub-config pattern as RagLogConfig / loadRagLogConfig().
 */

export type AiProviderType = 'openai' | 'openai-compatible' | 'ollama' | 'fallback';

export interface AiProviderConfig {
  readonly provider: AiProviderType;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly isConfigured: boolean;
}

const PROVIDER_DEFAULTS: Record<
  Exclude<AiProviderType, 'fallback'>,
  { baseUrl: string; apiKey: string; chatModel: string; embeddingModel: string }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    chatModel: 'llama3',
    embeddingModel: 'nomic-embed-text',
  },
  'openai-compatible': {
    baseUrl: '',
    apiKey: '',
    chatModel: '',
    embeddingModel: '',
  },
};

function resolveProviderType(): AiProviderType {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === 'openai' || explicit === 'openai-compatible' || explicit === 'ollama') {
    return explicit;
  }
  // Backward compatibility: OPENAI_API_KEY auto-detects as openai
  if (typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0) {
    return 'openai';
  }
  return 'fallback';
}

/**
 * Load AI provider configuration from environment variables.
 *
 * Detection logic:
 * 1. AI_PROVIDER explicitly set → use that provider
 * 2. OPENAI_API_KEY exists → provider = openai (backward compat)
 * 3. Otherwise → provider = fallback (deterministic hash vectors)
 *
 * Environment variables:
 * - AI_PROVIDER: openai | openai-compatible | ollama
 * - AI_BASE_URL: override default base URL
 * - AI_API_KEY: override default API key
 * - AI_CHAT_MODEL: override default chat model
 * - AI_EMBEDDING_MODEL: override default embedding model
 */
export function loadAiProviderConfig(): AiProviderConfig {
  const provider = resolveProviderType();

  if (provider === 'fallback') {
    return {
      provider,
      baseUrl: '',
      apiKey: '',
      chatModel: '',
      embeddingModel: '',
      isConfigured: false,
    };
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrl = process.env.AI_BASE_URL || defaults.baseUrl;
  const apiKey =
    process.env.AI_API_KEY ||
    (provider === 'openai' ? process.env.OPENAI_API_KEY || '' : defaults.apiKey);
  const chatModel = process.env.AI_CHAT_MODEL || defaults.chatModel;
  const embeddingModel = process.env.AI_EMBEDDING_MODEL || defaults.embeddingModel;

  const isConfigured =
    baseUrl.length > 0 &&
    apiKey.length > 0 &&
    chatModel.length > 0 &&
    embeddingModel.length > 0;

  return { provider, baseUrl, apiKey, chatModel, embeddingModel, isConfigured };
}
