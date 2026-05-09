import { describe, expect, it } from 'vitest';

import {
  ALL_PROVIDERS,
  PROVIDER_CONFIGS,
  getProviderConfig,
  isAiPromptProvider,
  listProviders,
  loadProviderTemplate,
  resolveProvider,
  selectProvider,
} from './index.js';
import type { AiPromptProvider } from './types.js';

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const original = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(patch)) {
    original.set(key, process.env[key]);
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// selectProvider
// ---------------------------------------------------------------------------

describe('selectProvider', () => {
  it('selects anthropic for claude model IDs', () => {
    expect(selectProvider('claude-3-opus').name).toBe('anthropic');
    expect(selectProvider('claude-3.5-sonnet').name).toBe('anthropic');
    expect(selectProvider('anthropic/claude-3-opus').name).toBe('anthropic');
  });

  it('selects openai for gpt/o1/o3/chatgpt model IDs', () => {
    expect(selectProvider('gpt-4').name).toBe('openai');
    expect(selectProvider('gpt-4o-mini').name).toBe('openai');
    expect(selectProvider('o1-preview').name).toBe('openai');
    expect(selectProvider('o3-mini').name).toBe('openai');
    expect(selectProvider('chatgpt-4o-latest').name).toBe('openai');
  });

  it('selects deepseek for deepseek model IDs', () => {
    expect(selectProvider('deepseek-chat').name).toBe('deepseek');
    expect(selectProvider('deepseek-coder').name).toBe('deepseek');
  });

  it('selects kimi for kimi/moonshot model IDs', () => {
    expect(selectProvider('kimi-vl').name).toBe('kimi');
    expect(selectProvider('moonshot-v1-128k').name).toBe('kimi');
  });

  it('selects gemini for gemini model IDs', () => {
    expect(selectProvider('gemini-pro').name).toBe('gemini');
    expect(selectProvider('gemini-1.5-flash').name).toBe('gemini');
  });

  it('falls back to default for unknown model IDs', () => {
    expect(selectProvider('llama-3').name).toBe('default');
    expect(selectProvider('mistral-large').name).toBe('default');
    expect(selectProvider('random-model').name).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// resolveProvider
// ---------------------------------------------------------------------------

describe('resolveProvider', () => {
  it('uses explicit provider argument over env var', () => {
    const config = withEnv({ AI_PROMPT_PROVIDER: 'openai' }, () => resolveProvider('anthropic'));
    expect(config.name).toBe('anthropic');
  });

  it('falls back to AI_PROMPT_PROVIDER env var', () => {
    const config = withEnv({ AI_PROMPT_PROVIDER: 'deepseek' }, () => resolveProvider());
    expect(config.name).toBe('deepseek');
  });

  it('falls back to default when no provider specified', () => {
    const config = withEnv({ AI_PROMPT_PROVIDER: undefined }, () => resolveProvider());
    expect(config.name).toBe('default');
  });

  it('throws for unknown provider names', () => {
    expect(() => withEnv({ AI_PROMPT_PROVIDER: 'nonexistent' }, () => resolveProvider())).toThrow(
      'Unknown AI prompt provider "nonexistent"',
    );
  });

  it.each(ALL_PROVIDERS)('resolves known provider "%s"', (provider) => {
    const config = resolveProvider(provider as AiPromptProvider);
    expect(config.name).toBe(provider);
  });
});

// ---------------------------------------------------------------------------
// loadProviderTemplate
// ---------------------------------------------------------------------------

describe('loadProviderTemplate', () => {
  it('loads XML template for anthropic', () => {
    const template = loadProviderTemplate('anthropic');
    expect(template).toContain('<system_instructions>');
    expect(template.length).toBeGreaterThan(0);
  });

  it('loads JSON template for openai', () => {
    const template = loadProviderTemplate('openai');
    // JSON templates start with a brace after trimming
    const trimmed = template.trim();
    expect(trimmed.startsWith('{')).toBe(true);
  });

  it('loads templates for all registered providers', () => {
    for (const provider of ALL_PROVIDERS) {
      const template = loadProviderTemplate(provider as AiPromptProvider);
      expect(template.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getProviderConfig
// ---------------------------------------------------------------------------

describe('getProviderConfig', () => {
  it('returns correct format for each provider', () => {
    expect(getProviderConfig('anthropic').format).toBe('xml');
    expect(getProviderConfig('openai').format).toBe('json');
    expect(getProviderConfig('deepseek').format).toBe('xml');
    expect(getProviderConfig('kimi').format).toBe('json');
    expect(getProviderConfig('gemini').format).toBe('xml');
    expect(getProviderConfig('default').format).toBe('xml');
  });

  it('includes cacheStrategy for all providers', () => {
    for (const provider of ALL_PROVIDERS) {
      const config = getProviderConfig(provider as AiPromptProvider);
      expect(config.cacheStrategy).toBeDefined();
      expect(Array.isArray(config.cacheStrategy.staticSections)).toBe(true);
      expect(Array.isArray(config.cacheStrategy.dynamicSections)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// listProviders & isAiPromptProvider
// ---------------------------------------------------------------------------

describe('listProviders', () => {
  it('returns all 6 providers', () => {
    expect(listProviders()).toHaveLength(6);
    expect(listProviders()).toContain('anthropic');
    expect(listProviders()).toContain('openai');
    expect(listProviders()).toContain('deepseek');
    expect(listProviders()).toContain('kimi');
    expect(listProviders()).toContain('gemini');
    expect(listProviders()).toContain('default');
  });
});

describe('isAiPromptProvider', () => {
  it('returns true for valid provider names', () => {
    for (const provider of ALL_PROVIDERS) {
      expect(isAiPromptProvider(provider)).toBe(true);
    }
  });

  it('returns false for invalid provider names', () => {
    expect(isAiPromptProvider('nonexistent')).toBe(false);
    expect(isAiPromptProvider('')).toBe(false);
    expect(isAiPromptProvider('Anthropic')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PROVIDER_CONFIGS
// ---------------------------------------------------------------------------

describe('PROVIDER_CONFIGS', () => {
  it('has a config for every registered provider', () => {
    for (const provider of ALL_PROVIDERS) {
      expect(PROVIDER_CONFIGS[provider]).toBeDefined();
      expect(PROVIDER_CONFIGS[provider].name).toBe(provider);
    }
  });

  it('anthropic uses role as static section', () => {
    expect(PROVIDER_CONFIGS.anthropic.cacheStrategy.staticSections).toContain('role');
  });

  it('openai uses constraints as static section', () => {
    expect(PROVIDER_CONFIGS.openai.cacheStrategy.staticSections).toContain('constraints');
  });
});
