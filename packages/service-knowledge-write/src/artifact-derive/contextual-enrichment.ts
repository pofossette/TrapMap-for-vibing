/**
 * Contextual enrichment module for Skill Capsules.
 *
 * Implements Anthropic Contextual Retrieval strategy:
 * - Phase 1: Generate capsule manifest (structured JSON) from full document
 * - Phase 2: Generate contextual prefix for each capsule (concurrent, prompt-cache-optimised)
 *
 * References:
 * - docs/plans/capsule-contextual-enrichment-plan.md
 * - https://www.anthropic.com/research/contextual-retrieval
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type { DerivedSkillCapsuleRecord } from '@trapmap/service-knowledge-read/store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapsuleManifestItem {
  capsuleIndex: number;
  title: string;
  description: string;
  contentScope: string;
  sourceType: 'skill-main' | 'reference';
  sourcePath: string;
  relatedProblemIndex?: number;
  tags: string[];
}

interface CapsuleManifest {
  documentTitle: string;
  documentLabels: string[];
  capsules: CapsuleManifestItem[];
}

interface CapsuleContentResult {
  capsuleIndex: number;
  contextualPrefix: string | null;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const MAX_CONTEXTUAL_PREFIX_LENGTH = 300;

/**
 * Maximum document content length (chars) included in LLM prompts.
 * Documents longer than this are truncated to avoid excessive token usage.
 * ~8000 chars ≈ 2000 tokens — sufficient context for manifest/prefix generation.
 */
const MAX_DOCUMENT_CONTENT_LENGTH = 8000;

/**
 * Truncate document content to a reasonable length for LLM prompts.
 * Tries to cut at a paragraph boundary; falls back to hard truncation.
 */
function truncateForPrompt(content: string, maxLength = MAX_DOCUMENT_CONTENT_LENGTH): string {
  if (content.length <= maxLength) return content;
  const truncated = content.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n\n');
  return lastNewline > maxLength * 0.5 ? truncated.slice(0, lastNewline) : truncated;
}

/**
 * Build the LLM prompt for Phase 1 – capsule manifest generation.
 *
 * The prompt asks the model to analyse the full document and produce a
 * structured JSON manifest describing what capsules should be created.
 */
function buildManifestPrompt(
  documentTitle: string,
  labels: string[],
  documentContent: string,
): string {
  const content = truncateForPrompt(documentContent);
  return `You are analysing a skill document to plan capsule extraction.

Document title: ${documentTitle}
Document labels: ${labels.join(', ')}

--- DOCUMENT START ---
${content}
--- DOCUMENT END ---

Task: Produce a JSON manifest describing the capsules to extract from this document.

Rules:
1. Each capsule covers one coherent knowledge unit (situation + problem + goal).
2. The first capsule MUST come from SKILL.md (sourceType: "skill-main").
3. Additional capsules may come from reference files (sourceType: "reference").
4. Maximum 5 capsules total.
5. Each contextualPrefix must be <= ${MAX_CONTEXTUAL_PREFIX_LENGTH} characters.

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "documentTitle": "<title>",
  "documentLabels": ["<label>", ...],
  "capsules": [
    {
      "capsuleIndex": 0,
      "title": "<capsule title>",
      "description": "<what this capsule covers>",
      "contentScope": "<scope of the content>",
      "sourceType": "skill-main" | "reference",
      "sourcePath": "<source file path>",
      "tags": ["<tag>", ...]
    }
  ]
}`;
}

/**
 * Build the LLM prompt for Phase 2 – single capsule contextual prefix.
 *
 * Uses prompt caching: the document info and manifest are shared across all
 * calls for the same document. Only the per-capsule manifest item varies.
 */
function buildContentPrompt(
  documentTitle: string,
  labels: string[],
  documentContent: string,
  manifestItem: CapsuleManifestItem,
): string {
  const content = truncateForPrompt(documentContent);
  return `You are generating a contextual prefix for a knowledge capsule.

Document title: ${documentTitle}
Document labels: ${labels.join(', ')}
Source file: ${manifestItem.sourcePath}
Capsule title: ${manifestItem.title}
Capsule description: ${manifestItem.description}
Capsule scope: ${manifestItem.contentScope}
Tags: ${manifestItem.tags.join(', ')}

--- DOCUMENT START ---
${content}
--- DOCUMENT END ---

Task: Generate a concise contextual prefix (max ${MAX_CONTEXTUAL_PREFIX_LENGTH} chars) for capsule #${manifestItem.capsuleIndex}.

The prefix should explain:
- What this document is about
- Where this capsule fits in the document
- How it relates to the main topic

Rules:
- Plain text only, no markdown
- Max ${MAX_CONTEXTUAL_PREFIX_LENGTH} characters
- Factual and specific, not generic

Respond with ONLY the prefix text (no JSON, no quotes, no explanation):`;
}

// ---------------------------------------------------------------------------
// Phase 1: Manifest generation
// ---------------------------------------------------------------------------

/**
 * Parse an LLM response into a CapsuleManifest.
 * Returns null if parsing fails.
 */
function parseManifestResponse(raw: string): CapsuleManifest | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.documentTitle === 'string' &&
      Array.isArray(parsed.documentLabels) &&
      Array.isArray(parsed.capsules)
    ) {
      for (const item of parsed.capsules) {
        if (
          typeof item.capsuleIndex !== 'number' ||
          typeof item.title !== 'string' ||
          typeof item.description !== 'string' ||
          typeof item.contentScope !== 'string' ||
          !['skill-main', 'reference'].includes(item.sourceType) ||
          typeof item.sourcePath !== 'string' ||
          !Array.isArray(item.tags)
        ) {
          return null;
        }
      }
      return parsed as CapsuleManifest;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a capsule manifest by calling the LLM.
 *
 * @param chat - Chat provider
 * @param documentTitle - Title of the source document
 * @param labels - Document labels
 * @param documentContent - Full document content
 * @returns Parsed manifest, or null on failure
 */
async function generateCapsuleManifest(
  chat: ChatProvider,
  documentTitle: string,
  labels: string[],
  documentContent: string,
): Promise<CapsuleManifest | null> {
  if (!chat.isConfigured) return null;

  try {
    const prompt = buildManifestPrompt(documentTitle, labels, documentContent);
    const response = await chat.invoke(
      'You are a document analysis assistant. Respond only with valid JSON.',
      prompt,
    );
    return parseManifestResponse(response);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Content generation
// ---------------------------------------------------------------------------

/**
 * Generate contextual prefix for a single capsule.
 * Includes retry with exponential backoff on transient failures.
 *
 * @param chat - Chat provider
 * @param documentTitle - Document title
 * @param labels - Document labels
 * @param documentContent - Full document content
 * @param manifestItem - The specific capsule manifest item
 * @param maxRetries - Maximum retry attempts (default 2)
 * @returns Contextual prefix string, or null on failure
 */
async function generateSingleCapsuleContent(
  chat: ChatProvider,
  documentTitle: string,
  labels: string[],
  documentContent: string,
  manifestItem: CapsuleManifestItem,
  maxRetries = 2,
): Promise<CapsuleContentResult> {
  if (!chat.isConfigured) {
    return { capsuleIndex: manifestItem.capsuleIndex, contextualPrefix: null };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildContentPrompt(documentTitle, labels, documentContent, manifestItem);
      const response = await chat.invoke(
        'You are a contextual prefix generator. Respond only with the prefix text.',
        prompt,
      );

      const prefix = response.trim().slice(0, MAX_CONTEXTUAL_PREFIX_LENGTH);
      return { capsuleIndex: manifestItem.capsuleIndex, contextualPrefix: prefix || null };
    } catch {
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 400ms
        await new Promise((r) => setTimeout(r, 100 * 2 ** (attempt * 2)));
      }
    }
  }

  return { capsuleIndex: manifestItem.capsuleIndex, contextualPrefix: null };
}

/**
 * Generate contextual prefixes for all capsules concurrently.
 *
 * @param chat - Chat provider
 * @param documentTitle - Document title
 * @param labels - Document labels
 * @param documentContent - Full document content
 * @param manifestItems - Manifest items to generate prefixes for
 * @param maxConcurrent - Maximum concurrent LLM calls (default 3)
 */
async function generateCapsuleContents(
  chat: ChatProvider,
  documentTitle: string,
  labels: string[],
  documentContent: string,
  manifestItems: CapsuleManifestItem[],
  maxConcurrent = 3,
): Promise<CapsuleContentResult[]> {
  const results: CapsuleContentResult[] = [];

  for (let i = 0; i < manifestItems.length; i += maxConcurrent) {
    const batch = manifestItems.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map((item) =>
        generateSingleCapsuleContent(chat, documentTitle, labels, documentContent, item),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic fallback contextual prefix when LLM is unavailable.
 */
function buildFallbackPrefix(
  documentTitle: string,
  sourceType: 'skill-main' | 'reference',
  sourcePath: string,
): string {
  const sourceLabel = sourceType === 'skill-main' ? 'main document' : `reference: ${sourcePath}`;
  const prefix = `${documentTitle} — from ${sourceLabel}`;
  return prefix.slice(0, MAX_CONTEXTUAL_PREFIX_LENGTH);
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Simple in-memory cache for contextual prefixes.
 * Keyed by `${sourceHash}:${capsuleIndex}`.
 */
export class ContextualEnrichmentCache {
  private readonly store = new Map<string, string>();

  buildKey(sourceHash: string, capsuleIndex: number): string {
    return `${sourceHash}:${capsuleIndex}`;
  }

  // fallow-ignore-next-line unused-class-member -- called via cache?. optional chaining in enrichCapsules (lines 487/534); fallow cannot resolve optional-chained calls
  get(sourceHash: string, capsuleIndex: number): string | undefined {
    return this.store.get(this.buildKey(sourceHash, capsuleIndex));
  }

  // fallow-ignore-next-line unused-class-member -- called via cache?. optional chaining in enrichCapsules (line 558); fallow cannot resolve optional-chained calls
  set(sourceHash: string, capsuleIndex: number, prefix: string): void {
    this.store.set(this.buildKey(sourceHash, capsuleIndex), prefix);
  }

  // fallow-ignore-next-line unused-class-member -- called via cache?. optional chaining in enrichCapsules (line 477); fallow cannot resolve optional-chained calls
  has(sourceHash: string, capsuleIndex: number): boolean {
    return this.store.has(this.buildKey(sourceHash, capsuleIndex));
  }
}

// ---------------------------------------------------------------------------
// High-level orchestrator
// ---------------------------------------------------------------------------

export interface EnrichCapsulesOptions {
  chat: ChatProvider;
  documentTitle: string;
  labels: string[];
  documentContent: string;
  sourceHash: string;
  cache?: ContextualEnrichmentCache;
  maxConcurrent?: number;
  /** Explicit kill-switch for enrichment (D-4). Defaults to true. */
  enrichmentEnabled?: boolean;
}

/**
 * Performance and health metrics from an enrichment run.
 * Returned by enrichCapsules for caller-side monitoring.
 */
export interface EnrichmentMetrics {
  /** Total capsules processed */
  totalCapsules: number;
  /** Capsules enriched via LLM */
  llmSuccessCount: number;
  /** Capsules that used cache */
  cacheHitCount: number;
  /** Capsules that fell back to deterministic prefix */
  fallbackCount: number;
  /** Whether the manifest phase succeeded */
  manifestGenerated: boolean;
  /** Wall-clock duration of the entire enrichment in ms */
  durationMs: number;
}

export interface EnrichCapsulesResult {
  /** Capsules with contextualPrefix populated */
  capsules: DerivedSkillCapsuleRecord[];
  /** Performance and health metrics */
  metrics: EnrichmentMetrics;
}

/**
 * Enrich derived capsules with contextual prefixes.
 *
 * Orchestrates the full enrichment pipeline:
 * 1. Check enrichmentEnabled flag (D-4 kill-switch)
 * 2. Check cache for existing prefixes
 * 3. Generate manifest via LLM (Phase 1)
 * 4. Generate prefixes for uncached capsules (Phase 2)
 * 5. Fall back to deterministic prefixes on LLM failure
 * 6. Store results in cache
 *
 * @returns Capsules with contextualPrefix populated + metrics
 */
export async function enrichCapsules(
  capsules: DerivedSkillCapsuleRecord[],
  options: EnrichCapsulesOptions,
): Promise<EnrichCapsulesResult> {
  const startTime = Date.now();

  if (capsules.length === 0) {
    return {
      capsules,
      metrics: {
        totalCapsules: 0,
        llmSuccessCount: 0,
        cacheHitCount: 0,
        fallbackCount: 0,
        manifestGenerated: false,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // D-4: Kill-switch — skip enrichment entirely
  if (options.enrichmentEnabled === false) {
    return {
      capsules,
      metrics: {
        totalCapsules: capsules.length,
        llmSuccessCount: 0,
        cacheHitCount: 0,
        fallbackCount: 0,
        manifestGenerated: false,
        durationMs: Date.now() - startTime,
      },
    };
  }

  const { chat, documentTitle, labels, documentContent, sourceHash, cache, maxConcurrent } =
    options;

  // Separate cached vs uncached capsules
  const uncachedIndexes = new Set<number>();
  let cacheHitCount = 0;
  for (let i = 0; i < capsules.length; i++) {
    if (cache?.has(sourceHash, i)) {
      cacheHitCount++;
    } else {
      uncachedIndexes.add(i);
    }
  }

  // If all cached, apply and return
  if (uncachedIndexes.size === 0 && cache) {
    const enriched = capsules.map((c, i) => {
      const cached = cache.get(sourceHash, i);
      return cached ? { ...c, contextualPrefix: cached } : c;
    });
    return {
      capsules: enriched,
      metrics: {
        totalCapsules: capsules.length,
        llmSuccessCount: 0,
        cacheHitCount,
        fallbackCount: 0,
        manifestGenerated: false,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Try LLM enrichment for uncached capsules
  const manifest = await generateCapsuleManifest(chat, documentTitle, labels, documentContent);

  let contentResults: CapsuleContentResult[] = [];

  if (manifest && manifest.capsules.length > 0) {
    // Filter manifest items to only uncached capsules
    const uncachedItems = manifest.capsules.filter((_, i) => uncachedIndexes.has(i));
    contentResults = await generateCapsuleContents(
      chat,
      documentTitle,
      labels,
      documentContent,
      uncachedItems,
      maxConcurrent,
    );
  }

  // Build result map from LLM results
  const prefixMap = new Map<number, string>();
  for (const result of contentResults) {
    if (result.contextualPrefix) {
      prefixMap.set(result.capsuleIndex, result.contextualPrefix);
    }
  }

  // Apply: LLM result -> cache -> fallback
  let llmSuccessCount = 0;
  let fallbackCount = 0;

  const enriched = capsules.map((c, i) => {
    const cached = cache?.get(sourceHash, i);
    const llmPrefix = prefixMap.get(i);

    let prefix: string;
    let source: 'llm' | 'cache' | 'fallback';
    if (llmPrefix) {
      prefix = llmPrefix;
      source = 'llm';
    } else if (cached) {
      prefix = cached;
      source = 'cache';
    } else {
      // Fallback: deterministic prefix from source path
      const sourcePath = c.sourcePaths[0] ?? 'SKILL.md';
      const sourceType = sourcePath === 'SKILL.md' ? 'skill-main' : 'reference';
      prefix = buildFallbackPrefix(
        documentTitle,
        sourceType as 'skill-main' | 'reference',
        sourcePath,
      );
      source = 'fallback';
    }

    // Store in cache
    cache?.set(sourceHash, i, prefix);

    if (source === 'llm') llmSuccessCount++;
    else if (source === 'fallback') fallbackCount++;

    return { ...c, contextualPrefix: prefix };
  });

  return {
    capsules: enriched,
    metrics: {
      totalCapsules: capsules.length,
      llmSuccessCount,
      cacheHitCount,
      fallbackCount,
      manifestGenerated: manifest !== null,
      durationMs: Date.now() - startTime,
    },
  };
}
