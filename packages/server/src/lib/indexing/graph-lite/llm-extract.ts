/**
 * LLM-powered graph extraction orchestrator.
 *
 * Pipeline:
 * 1. Phase 1 (planning): segment the text via `planExtraction`
 * 2. Phase 2 (extraction): extract entities from each segment (concurrent)
 * 3. Merge segment results via `mergeExtractions`
 * 4. Optional gleaning (secondary extraction)
 * 5. Convert to GraphNodeRecord/GraphEdgeRecord via `toGraphRecords`
 *
 * Sub-modules:
 * - `llm-extract-ids.ts`     — deterministic ID generation
 * - `llm-extract-parsing.ts` — LLM JSON response parsing + Zod validation
 * - `llm-extract-planning.ts` — Phase 1 text segmentation
 * - `llm-extract-merge.ts`   — merging + record conversion
 */

import type { ExtractionMetrics, LlmGraphExtraction, LlmGraphNode } from '@trapmap/contracts';

import { buildGraphExtractionSlots_default, buildPrompt } from '@trapmap/server/lib/ai/prompts.js';
import type { ChatProvider, EmbeddingsProvider } from '@trapmap/server/lib/ai/types.js';
import type { LabelRepository } from '@trapmap/server/lib/labels/repository.js';
import { executeWithResilience } from '@trapmap/server/lib/runtime/resilience.js';
import type { GraphEdgeRecord, GraphNodeRecord } from './documents.js';

import type { LlmExtractionCache } from './llm-cache.js';
import { dedupeGraphRecords, mergeExtractions, toGraphRecords } from './llm-extract-merge.js';
import { parseLlmExtraction } from './llm-extract-parsing.js';
import { planExtraction } from './llm-extract-planning.js';

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export { buildEdgeId, buildNodeId, normalizeValue } from './llm-extract-ids.js';
export {
  dedupeGraphRecords,
  mergeExtractions,
  toGraphRecords,
} from './llm-extract-merge.js';
export { parseExtractionPlan, parseLlmExtraction } from './llm-extract-parsing.js';
export { planExtraction } from './llm-extract-planning.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent segment extractions in Phase 2. */
const MAX_CONCURRENT = 3;

/** Maximum retry attempts per LLM call. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). */
const BACKOFF_BASE_MS = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of LLM-powered graph extraction. */
export interface LlmExtractionResult {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  metrics: ExtractionMetrics;
}

/** Options for the extraction orchestrator. */
export interface ExtractGraphOptions {
  /** Disable LLM and return empty extraction directly. */
  llmEnabled?: boolean;
  /** Custom prompt version for cache keying. */
  promptVersion?: string;
  /** Optional cache for Phase 1 (planning) and Phase 2 (extraction) results. */
  cache?: LlmExtractionCache;
  /** Optional alignment service for canonical label resolution. */
  alignmentService?: {
    chat: ChatProvider | null;
    repository: unknown | null;
    embeddings?: EmbeddingsProvider | null;
    sourceContext?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Phase 2: Single-segment entity extraction
// ---------------------------------------------------------------------------

/**
 * Extract graph entities from a single text segment via LLM.
 * Returns null if LLM is unavailable or output is invalid.
 */
export async function extractSegmentEntities(
  chat: ChatProvider,
  segment: string,
  maxRetries = MAX_RETRIES,
): Promise<LlmGraphExtraction | null> {
  if (!chat.isConfigured) return null;

  const systemPrompt = buildPrompt('graph-extraction', buildGraphExtractionSlots_default());
  const result = await executeWithResilience({
    policy: {
      dependencyName: 'graph-llm-segment-extraction',
      timeoutMs: 15_000,
      maxAttempts: maxRetries + 1,
      backoffMs: (attempt) => BACKOFF_BASE_MS * 2 ** (attempt * 2),
      failureMode: 'fail-open',
    },
    operation: async () => {
      const response = await chat.invoke(systemPrompt, segment);
      return parseLlmExtraction(response);
    },
    isSuccessfulResult: (value) => value !== null,
    fallbackValue: null,
  });

  return result.value ?? null;
}

// ---------------------------------------------------------------------------
// Gleaning prompt (secondary extraction)
// ---------------------------------------------------------------------------

function buildGleaningPrompt(originalText: string, existingNodes: string[]): string {
  return `The following text was already analyzed. These entities were found:
${existingNodes.map((n) => `- ${n}`).join('\n')}

Review the text again and identify any ADDITIONAL entities or relations that were missed.
Do not repeat existing entities. Focus on:
- Implicit prerequisites not explicitly labeled
- Alternative mitigation approaches
- Co-occurring tools/environments not yet captured
- Symptom/error patterns (cues) that signal the trap

Text:
${originalText}`;
}

/**
 * Perform gleaning (secondary extraction) to catch missed entities.
 * Compares the gleaning result with the original and merges.
 */
async function gleaningExtraction(
  chat: ChatProvider,
  text: string,
  existing: LlmGraphExtraction,
): Promise<LlmGraphExtraction | null> {
  if (!chat.isConfigured) return null;

  const existingNodeLabels = existing.nodes.map((n) => `${n.kind}: ${n.label}`);

  const gleaningUserMsg = buildGleaningPrompt(text, existingNodeLabels);

  try {
    const systemPrompt = buildPrompt('graph-extraction', buildGraphExtractionSlots_default());
    const response = await chat.invoke(systemPrompt, gleaningUserMsg);
    const gleaningResult = parseLlmExtraction(response);
    if (!gleaningResult) return null;
    return mergeExtractions([existing, gleaningResult]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batched concurrent extraction
// ---------------------------------------------------------------------------

/** Process segments in batches with max concurrency. */
async function extractBatched(
  chat: ChatProvider,
  segments: string[],
): Promise<LlmGraphExtraction[]> {
  const results: LlmGraphExtraction[] = [];

  for (let i = 0; i < segments.length; i += MAX_CONCURRENT) {
    const batch = segments.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((segment) => extractSegmentEntities(chat, segment)),
    );
    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main orchestrator: two-phase LLM extraction
// ---------------------------------------------------------------------------

/**
 * Extract graph entities using the two-phase LLM pipeline.
 *
 * Pipeline:
 * 1. Phase 1 (planning): segment the text (skip if short)
 * 2. Phase 2 (extraction): extract entities from each segment (concurrent)
 * 3. Merge segment results
 * 4. Optional gleaning
 * 5. Convert to GraphNodeRecord/GraphEdgeRecord
 *
 * @param chat - LLM chat provider
 * @param text - canonical text to extract from
 * @param options - extraction options
 */
export async function extractGraphEntitiesWithLLM(
  chat: ChatProvider,
  text: string,
  options?: ExtractGraphOptions,
): Promise<LlmExtractionResult> {
  const metrics: ExtractionMetrics = {
    llmSuccessCount: 0,
    cacheHitCount: 0,
    llmUnavailableCount: 0,
    extractionErrorCount: 0,
    emptyExtractionCount: 0,
    phase1Ms: 0,
    phase2Ms: 0,
    gleaningCount: 0,
  };

  const llmEnabled = options?.llmEnabled !== false;

  // If LLM disabled or unavailable, return empty extraction with explicit metrics.
  if (!llmEnabled || !chat.isConfigured) {
    metrics.llmUnavailableCount = 1;
    return { nodes: [], edges: [], metrics };
  }

  try {
    // Check Phase 2 cache first
    const cache = options?.cache;
    if (cache) {
      const cachedResult = cache.getPhase2(text);
      if (cachedResult) {
        metrics.cacheHitCount = 1;
        return { nodes: cachedResult.nodes, edges: cachedResult.edges, metrics };
      }
    }

    // Phase 1: Planning
    const phase1Start = Date.now();
    const plan = await planExtraction(chat, text, cache);
    metrics.phase1Ms = Date.now() - phase1Start;

    // Phase 2: Parallel segment extraction
    const phase2Start = Date.now();
    let extractions: LlmGraphExtraction[];

    if (plan.segments.length === 1) {
      // Single segment — direct extraction
      const segment = plan.segments[0];
      if (segment) {
        const result = await extractSegmentEntities(chat, segment.text);
        extractions = result ? [result] : [];
      } else {
        extractions = [];
      }
    } else {
      // Multiple segments — batched concurrent extraction
      extractions = await extractBatched(
        chat,
        plan.segments.map((s) => s.text),
      );
    }

    metrics.phase2Ms = Date.now() - phase2Start;
    metrics.llmSuccessCount = extractions.length;

    // If all segments failed, return empty extraction with explicit error metrics.
    if (extractions.length === 0) {
      metrics.extractionErrorCount = 1;
      return { nodes: [], edges: [], metrics };
    }

    // Merge all segment results
    let merged = mergeExtractions(extractions);

    // Optional: gleaning (only if we had successful extractions)
    if (merged.nodes.length > 0) {
      const gleaned = await gleaningExtraction(chat, text, merged);
      if (gleaned) {
        merged = gleaned;
        metrics.gleaningCount = 1;
      }
    }

    // Convert to typed records
    let { nodes, edges } = toGraphRecords(merged);

    // Phase 3: Optional canonical label alignment
    const alignmentService = options?.alignmentService;
    if (alignmentService?.chat && alignmentService.repository) {
      try {
        const { alignGraphNodes, rewriteEdgeIds } = await import(
          '@trapmap/server/lib/labels/graph-align.js'
        );
        const alignmentResult = await alignGraphNodes(merged.nodes as LlmGraphNode[], {
          chat: alignmentService.chat,
          repository: alignmentService.repository as LabelRepository,
          embeddings: alignmentService.embeddings ?? null,
          sourceContext: alignmentService.sourceContext ?? 'extraction',
        });

        if (alignmentResult.nodeIdMapping.size > 0) {
          // Rewrite node IDs and edge endpoints
          nodes = alignmentResult.nodes;
          edges = rewriteEdgeIds(edges, alignmentResult.nodeIdMapping);
        } else {
          // Still apply alignment metadata even if no ID changes
          nodes = alignmentResult.nodes;
        }
      } catch {
        // Alignment failure is non-fatal — keep raw nodes
      }
    }

    if (nodes.length === 0) {
      metrics.emptyExtractionCount = 1;
    }

    // Store in Phase 2 cache
    if (cache && nodes.length > 0) {
      cache.setPhase2(text, { nodes, edges, metrics });
    }

    return { ...dedupeGraphRecords({ nodes, edges }), metrics };
  } catch {
    metrics.extractionErrorCount = 1;
    return { nodes: [], edges: [], metrics };
  }
}
