export type AiProviderType =
  | 'openai'
  | 'openai-compatible'
  | 'ollama'
  | 'google-genai'
  | 'fallback';

export interface AiProviderConfig {
  readonly provider: AiProviderType;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly isConfigured: boolean;
  readonly promptTemplateFile: string | null;
  readonly embeddingProvider?:
    | {
        readonly provider: AiProviderType;
        readonly baseUrl: string;
        readonly apiKey: string;
        readonly model: string;
        readonly isConfigured: boolean;
      }
    | undefined;
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
  'google-genai': {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    chatModel: 'gemini-2.0-flash',
    embeddingModel: 'text-embedding-004',
  },
};

type ConfiguredAiProviderType = Exclude<AiProviderType, 'fallback'>;

function loadPromptTemplateFile(): string | null {
  const value = process.env.AI_PROMPT_TEMPLATE_FILE;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resolveProviderType(): AiProviderType {
  const explicit = process.env.AI_PROVIDER;
  if (
    explicit === 'openai' ||
    explicit === 'openai-compatible' ||
    explicit === 'ollama' ||
    explicit === 'google-genai'
  ) {
    return explicit;
  }
  if (typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0) {
    return 'openai';
  }
  if (typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 0) {
    return 'google-genai';
  }
  return 'fallback';
}

function resolveApiKey(provider: ConfiguredAiProviderType, defaultApiKey: string): string {
  const providerSpecificKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : provider === 'google-genai'
        ? process.env.GEMINI_API_KEY
        : undefined;

  return (
    (typeof providerSpecificKey === 'string' && providerSpecificKey.trim().length > 0
      ? providerSpecificKey
      : process.env.AI_API_KEY) || defaultApiKey
  );
}

function resolveEmbeddingProvider(): AiProviderConfig['embeddingProvider'] {
  const provider = process.env.EMBEDDING_PROVIDER as AiProviderType | undefined;
  if (!provider || provider === 'fallback') return undefined;

  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrl = process.env.EMBEDDING_BASE_URL || defaults.baseUrl;
  const apiKey = process.env.EMBEDDING_API_KEY || defaults.apiKey;
  const model = process.env.EMBEDDING_MODEL || defaults.embeddingModel;

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    isConfigured: baseUrl.length > 0 && apiKey.length > 0 && model.length > 0,
  };
}

function createFallbackConfig(promptTemplateFile: string | null): AiProviderConfig {
  return {
    provider: 'fallback',
    baseUrl: '',
    apiKey: '',
    chatModel: '',
    embeddingModel: '',
    isConfigured: false,
    promptTemplateFile,
  };
}

function createConfiguredProviderConfig(
  provider: ConfiguredAiProviderType,
  promptTemplateFile: string | null,
): AiProviderConfig {
  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrl = process.env.AI_BASE_URL || defaults.baseUrl;
  const apiKey = resolveApiKey(provider, defaults.apiKey);
  const chatModel = process.env.AI_CHAT_MODEL || defaults.chatModel;
  const embeddingModel = process.env.AI_EMBEDDING_MODEL || defaults.embeddingModel;
  const embeddingProvider = resolveEmbeddingProvider();
  const hasEmbedding = embeddingModel.length > 0 || !!embeddingProvider?.isConfigured;
  const isConfigured =
    baseUrl.length > 0 && apiKey.length > 0 && chatModel.length > 0 && hasEmbedding;

  return {
    provider,
    baseUrl,
    apiKey,
    chatModel,
    embeddingModel,
    isConfigured,
    promptTemplateFile,
    embeddingProvider,
  };
}

export function loadAiProviderConfig(): AiProviderConfig {
  const provider = resolveProviderType();
  const promptTemplateFile = loadPromptTemplateFile();

  return provider === 'fallback'
    ? createFallbackConfig(promptTemplateFile)
    : createConfiguredProviderConfig(provider, promptTemplateFile);
}
