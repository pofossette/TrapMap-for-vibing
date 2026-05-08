/**
 * AI provider configuration.
 * Follows the same sub-config pattern as RagLogConfig / loadRagLogConfig().
 *
 * Supports separate providers for chat and embedding:
 * - Primary provider: AI_PROVIDER, AI_BASE_URL, AI_API_KEY, AI_CHAT_MODEL
 * - Embedding override (optional): EMBEDDING_PROVIDER, EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL
 *
 * If embedding override is not set, uses primary provider for both.
 */

export type AiProviderType =
  | 'openai'
  | 'openai-compatible'
  | 'ollama'
  | 'google-genai'
  | 'fallback';

export type AiPromptFormat = 'json' | 'markdown' | 'xml';

export interface AiPromptConfig {
  readonly formatByTask: {
    readonly boundaryExtraction: AiPromptFormat;
    readonly knowledgeRefinement: AiPromptFormat;
    readonly claimVerification: AiPromptFormat;
  };
  readonly templateFile: string | null;
}

export interface AiProviderConfig {
  readonly provider: AiProviderType;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly isConfigured: boolean;
  readonly prompt: AiPromptConfig;
  /** Embedding provider config if different from primary */
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

const PROMPT_FORMAT_DEFAULTS: AiPromptConfig['formatByTask'] = {
  boundaryExtraction: 'xml',
  knowledgeRefinement: 'markdown',
  claimVerification: 'json',
};

function resolvePromptFormat(
  envValue: string | undefined,
  envName: string,
  fallback: AiPromptFormat,
): AiPromptFormat {
  if (envValue === undefined) {
    return fallback;
  }

  if (envValue === 'json' || envValue === 'markdown' || envValue === 'xml') {
    return envValue;
  }

  throw new Error(`Invalid ${envName}. Expected one of: json, markdown, xml.`);
}

function loadAiPromptConfig(): AiPromptConfig {
  return {
    formatByTask: {
      boundaryExtraction: resolvePromptFormat(
        process.env.AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION,
        'AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION',
        PROMPT_FORMAT_DEFAULTS.boundaryExtraction,
      ),
      knowledgeRefinement: resolvePromptFormat(
        process.env.AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT,
        'AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT',
        PROMPT_FORMAT_DEFAULTS.knowledgeRefinement,
      ),
      claimVerification: resolvePromptFormat(
        process.env.AI_PROMPT_FORMAT_CLAIM_VERIFICATION,
        'AI_PROMPT_FORMAT_CLAIM_VERIFICATION',
        PROMPT_FORMAT_DEFAULTS.claimVerification,
      ),
    },
    templateFile: process.env.AI_PROMPT_TEMPLATE_FILE ?? null,
  };
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
  // Backward compatibility: OPENAI_API_KEY auto-detects as openai
  if (typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0) {
    return 'openai';
  }
  // Google GenAI auto-detection via GEMINI_API_KEY
  if (typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 0) {
    return 'google-genai';
  }
  return 'fallback';
}

/**
 * Load AI provider configuration from environment variables.
 *
 * Detection logic:
 * 1. AI_PROVIDER explicitly set → use that provider
 * 2. OPENAI_API_KEY exists → provider = openai (backward compat)
 * 3. GEMINI_API_KEY exists → provider = google-genai
 * 4. Otherwise → provider = fallback (deterministic hash vectors)
 *
 * Environment variables:
 * - AI_PROVIDER: openai | openai-compatible | ollama | google-genai
 * - AI_BASE_URL: override default base URL
 * - AI_API_KEY: override default API key (fallback: OPENAI_API_KEY for openai, GEMINI_API_KEY for google-genai)
 * - AI_CHAT_MODEL: override default chat model
 * - AI_EMBEDDING_MODEL: override default embedding model
 *
 * Separate embedding provider (optional):
 * - EMBEDDING_PROVIDER: openai | openai-compatible | ollama | google-genai
 * - EMBEDDING_BASE_URL: embedding API base URL
 * - EMBEDDING_API_KEY: embedding API key
 * - EMBEDDING_MODEL: embedding model name
 */
export function loadAiProviderConfig(): AiProviderConfig {
  const provider = resolveProviderType();
  const prompt = loadAiPromptConfig();

  if (provider === 'fallback') {
    return {
      provider,
      baseUrl: '',
      apiKey: '',
      chatModel: '',
      embeddingModel: '',
      isConfigured: false,
      prompt,
    };
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrl = process.env.AI_BASE_URL || defaults.baseUrl;
  const apiKey =
    process.env.AI_API_KEY ||
    (provider === 'openai' ? process.env.OPENAI_API_KEY || '' : defaults.apiKey) ||
    (provider === 'google-genai' ? process.env.GEMINI_API_KEY || '' : defaults.apiKey);
  const chatModel = process.env.AI_CHAT_MODEL || defaults.chatModel;
  const embeddingModel = process.env.AI_EMBEDDING_MODEL || defaults.embeddingModel;

  const isConfigured =
    baseUrl.length > 0 && apiKey.length > 0 && chatModel.length > 0 && embeddingModel.length > 0;

  // Check for separate embedding provider configuration
  const embeddingProviderType = process.env.EMBEDDING_PROVIDER as AiProviderType | undefined;
  let embeddingProvider: AiProviderConfig['embeddingProvider'];

  if (embeddingProviderType && embeddingProviderType !== 'fallback') {
    const embDefaults = PROVIDER_DEFAULTS[embeddingProviderType];
    const embBaseUrl = process.env.EMBEDDING_BASE_URL || embDefaults.baseUrl;
    const embApiKey = process.env.EMBEDDING_API_KEY || embDefaults.apiKey;
    const embModel = process.env.EMBEDDING_MODEL || embDefaults.embeddingModel;
    const embConfigured = embBaseUrl.length > 0 && embApiKey.length > 0 && embModel.length > 0;

    embeddingProvider = {
      provider: embeddingProviderType,
      baseUrl: embBaseUrl,
      apiKey: embApiKey,
      model: embModel,
      isConfigured: embConfigured,
    };
  }

  return {
    provider,
    baseUrl,
    apiKey,
    chatModel,
    embeddingModel,
    isConfigured,
    prompt,
    embeddingProvider,
  };
}
