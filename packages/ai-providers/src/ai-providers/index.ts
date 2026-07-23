/**
 * Provider-based prompt template system.
 *
 * Selects the optimal prompt provider based on model ID or explicit
 * configuration, loads the corresponding template, and exposes
 * provider metadata for cache management and dynamic injection.
 */

import { readFileSync } from 'node:fs';

import { ALL_PROVIDERS, PROVIDER_CONFIGS } from './defaults.js';
import type { AiPromptProvider, ProviderConfig } from './types.js';

// Re-export types so consumers can import everything from './providers/index.js'

export { PROVIDER_CONFIGS, ALL_PROVIDERS };

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

const MODEL_PROVIDER_MAP: ReadonlyArray<[pattern: RegExp, provider: AiPromptProvider]> = [
  [/claude/i, 'anthropic'],
  [/gpt|o1|o3|chatgpt/i, 'openai'],
  [/deepseek/i, 'deepseek'],
  [/kimi|moonshot/i, 'kimi'],
  [/gemini/i, 'gemini'],
];

/**
 * Select a provider configuration based on a model identifier string.
 *
 * Falls back to `default` when no pattern matches.
 */
export function selectProvider(modelId: string): ProviderConfig {
  for (const [pattern, provider] of MODEL_PROVIDER_MAP) {
    if (pattern.test(modelId)) {
      return PROVIDER_CONFIGS[provider];
    }
  }
  return PROVIDER_CONFIGS.default;
}

/**
 * Resolve a provider name from the environment or explicit override.
 *
 * Priority: explicit `provider` argument > `AI_PROMPT_PROVIDER` env var > 'default'.
 * Throws if the resolved name is not a known provider.
 */
export function resolveProvider(provider?: AiPromptProvider): ProviderConfig {
  const raw = provider ?? process.env.AI_PROMPT_PROVIDER ?? 'default';

  if (!isAiPromptProvider(raw)) {
    throw new Error(
      `Unknown AI prompt provider "${raw}". Valid providers: ${ALL_PROVIDERS.join(', ')}`,
    );
  }

  return PROVIDER_CONFIGS[raw];
}

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

/**
 * Load the raw template content for the given provider.
 */
export function loadProviderTemplate(provider: AiPromptProvider): string {
  const config = PROVIDER_CONFIGS[provider];
  return readFileSync(config.templatePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Configuration access
// ---------------------------------------------------------------------------

/**
 * Get the full configuration object for a provider.
 */
export function getProviderConfig(provider: AiPromptProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

/**
 * List all registered provider names.
 */
export function listProviders(): readonly AiPromptProvider[] {
  return ALL_PROVIDERS;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Check whether a string is a valid AiPromptProvider name.
 */
export function isAiPromptProvider(value: string): value is AiPromptProvider {
  return (ALL_PROVIDERS as readonly string[]).includes(value);
}
