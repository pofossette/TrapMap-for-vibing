/**
 * Default Provider configuration registry.
 *
 * Each provider maps to a template format and a cache strategy that
 * classifies prompt sections as static (cacheable) or dynamic (per-request).
 */

import path from 'node:path';

import type { AiPromptProvider, ProviderConfig } from './types.js';

const TEMPLATE_DIR = path.resolve(import.meta.dirname);

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export const PROVIDER_CONFIGS: Record<AiPromptProvider, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    format: 'xml',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'anthropic.xml'),
    cacheStrategy: {
      staticSections: ['role', 'core_principles', 'security', 'tool_usage_rules'],
      dynamicSections: ['code_context', 'current_environment', 'examples'],
    },
    specialConstraints: [
      'Use XML tags for structured content within the response.',
      'Leverage extended thinking for complex reasoning tasks.',
    ],
  },

  openai: {
    name: 'openai',
    format: 'json',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'openai.json'),
    cacheStrategy: {
      staticSections: ['role', 'task', 'constraints'],
      dynamicSections: ['code_context', 'current_environment'],
    },
    specialConstraints: [
      'Prefer JSON structured output when available.',
      'Use function calling for tool invocations.',
    ],
  },

  deepseek: {
    name: 'deepseek',
    format: 'xml',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'deepseek.xml'),
    cacheStrategy: {
      staticSections: ['role', 'core_principles', 'constraints'],
      dynamicSections: ['code_context', 'current_environment', 'examples'],
    },
    specialConstraints: [
      'Keep responses concise and direct.',
      'Use explicit format instructions; avoid implicit structure.',
    ],
  },

  kimi: {
    name: 'kimi',
    format: 'json',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'kimi.json'),
    cacheStrategy: {
      staticSections: ['role', 'task', 'constraints'],
      dynamicSections: ['code_context', 'current_environment'],
    },
    specialConstraints: ['Avoid XML; prefer JSON or plain text for structured content.'],
  },

  gemini: {
    name: 'gemini',
    format: 'xml',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'gemini.xml'),
    cacheStrategy: {
      staticSections: ['role', 'core_principles', 'constraints'],
      dynamicSections: ['code_context', 'current_environment', 'examples'],
    },
  },

  default: {
    name: 'default',
    format: 'xml',
    templatePath: path.join(TEMPLATE_DIR, 'templates', 'default.xml'),
    cacheStrategy: {
      staticSections: ['role', 'core_principles', 'constraints'],
      dynamicSections: ['code_context', 'current_environment', 'examples'],
    },
  },
};

// ---------------------------------------------------------------------------
// Provider list
// ---------------------------------------------------------------------------

export const ALL_PROVIDERS: readonly AiPromptProvider[] = [
  'anthropic',
  'openai',
  'deepseek',
  'kimi',
  'gemini',
  'default',
];
