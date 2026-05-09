export {
  type AiProviderConfig,
  type AiProviderType,
  loadAiProviderConfig,
} from './provider-config.js';
export {
  createAiProviders,
  FallbackChat,
  FallbackEmbeddings,
  GoogleGenAIEmbeddings,
  OpenAICompatibleChat,
  OpenAICompatibleEmbeddings,
} from './providers.js';
export {
  buildBoundaryExtractionSystemPrompt,
  buildClaimVerificationSystemPrompt,
  buildKnowledgeRefinementSystemPrompt,
  buildPrompt,
  buildPromptWithCacheControl,
} from './prompts.js';
export type { AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';

// Prompt provider system
export type {
  AiPromptProvider,
  AiPromptFormat,
  ProviderConfig,
  ProviderCacheStrategy,
  CacheSection,
  CacheBoundaryMarker,
  PromptSlots,
  AiPromptTaskType,
} from './providers/index.js';
export {
  PROVIDER_CONFIGS,
  ALL_PROVIDERS,
  selectProvider,
  resolveProvider,
  loadProviderTemplate,
  getProviderConfig,
  listProviders,
  isAiPromptProvider,
} from './providers/index.js';

// Cache management
export {
  getCachedSection,
  invalidateSection,
  clearAllSections,
  getSectionCacheSize,
  resetSectionCache,
  computeHash,
  CACHE_BOUNDARY_MARKER,
  splitPromptByBoundary,
  insertBoundaryMarker,
  buildCacheControlForSection,
  buildSystemPromptBlocks,
  getCacheMetrics,
  resetCacheMetrics,
  trackCacheHit,
  trackCacheMiss,
} from './cache/index.js';
export type {
  BoundarySplit,
  CacheMetrics,
  CacheMissReason,
  CacheControlHeader,
  PromptBlock,
} from './cache/index.js';

// Dynamic injection system
export {
  type DynamicInjection,
  type InjectionResult,
  injectDynamicContent,
  escapeRegExp,
  getDynamicInjections,
  type RuntimeContext,
  type ConditionalRule,
  getConditionalContent,
  getDefaultConditionalRules,
} from './dynamic/index.js';
