/**
 * Provider-based prompt template system types.
 *
 * Defines the type system for multi-provider prompt templates,
 * supporting different AI model families with optimized formats.
 */

// ---------------------------------------------------------------------------
// Provider identification
// ---------------------------------------------------------------------------

export type AiPromptProvider = 'anthropic' | 'openai' | 'deepseek' | 'kimi' | 'gemini' | 'default';

export type AiPromptFormat = 'xml' | 'json' | 'markdown';

// ---------------------------------------------------------------------------
// Prompt task types (canonical source of truth)
// ---------------------------------------------------------------------------

export type AiPromptTaskType =
  | 'boundary-extraction'
  | 'knowledge-refinement'
  | 'claim-verification'
  | 'graph-extraction'
  | 'graph-extraction-planner'
  | 'label-alignment';

// ---------------------------------------------------------------------------
// Prompt slots
// ---------------------------------------------------------------------------

export interface PromptSlots {
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];
  metadata?: {
    taskType: AiPromptTaskType;
    title: string;
    outputFormatHint?: string;
  };
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export interface ProviderCacheStrategy {
  /** Section names whose content is static and can be cached. */
  staticSections: string[];
  /** Section names whose content changes per request and must not be cached. */
  dynamicSections: string[];
}

export interface ProviderConfig {
  /** Canonical provider identifier. */
  readonly name: AiPromptProvider;
  /** Template format used by this provider. */
  readonly format: AiPromptFormat;
  /** Absolute path to the provider's template file. */
  readonly templatePath: string;
  /** Cache strategy for this provider's prompt sections. */
  readonly cacheStrategy: ProviderCacheStrategy;
  /** Provider-specific constraints injected into the prompt. */
  readonly specialConstraints?: string[];
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

export interface CacheSection {
  /** Section identifier (e.g. "role", "core_principles"). */
  readonly name: string;
  /** Rendered content of this section. */
  readonly content: string;
  /** Cache scope: 'global' for system-wide caching, 'org' for org-level,
   *  null when the section must not be cached. */
  readonly cacheScope: 'global' | 'org' | null;
}

export interface CacheBoundaryMarker {
  /** Byte offset where the boundary is inserted. */
  readonly position: number;
  /** Human-readable label for debugging. */
  readonly label: string;
}
