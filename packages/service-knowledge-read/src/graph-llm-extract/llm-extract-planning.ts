/**
 * Phase 1: Text segmentation planning for LLM extraction.
 *
 * For short texts (<= CHUNK_THRESHOLD), returns a single segment without LLM.
 * For longer texts, calls the LLM to create a segment plan.
 * Falls back to fixed-size chunking when LLM is unavailable or returns invalid output.
 */

import { type ExtractionPlan, extractionPlanSchema } from '@trapmap/contracts';

import { invokeWithParseRetry } from '@trapmap/ai-providers/ai-parse.js';
import {
  buildGraphExtractionPlannerSlots_default,
  buildPrompt,
} from '@trapmap/ai-providers/prompts.js';
import type { ChatProvider } from '@trapmap/ai-providers';

import type { LlmExtractionCache } from './llm-cache.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Texts longer than this trigger two-phase extraction (Phase 1 planning). */
const CHUNK_THRESHOLD = 2000;

// ---------------------------------------------------------------------------
// Phase 1: Extraction planning (text segmentation)
// ---------------------------------------------------------------------------

/**
 * Plan text segmentation for extraction.
 * For short text (<= CHUNK_THRESHOLD), returns a single segment without LLM.
 * For longer text, calls the LLM to create a segment plan.
 */
export async function planExtraction(
  chat: ChatProvider,
  text: string,
  cache?: LlmExtractionCache,
): Promise<ExtractionPlan> {
  if (text.length <= CHUNK_THRESHOLD) {
    return { segments: [{ text, priority: 1 }] };
  }

  // Check cache
  if (cache) {
    const cached = cache.getPhase1(text);
    if (cached) return cached;
  }

  if (!chat.isConfigured) {
    // Fallback: split into fixed-size chunks
    return createFixedChunkPlan(text);
  }

  try {
    const systemPrompt = buildPrompt(
      'graph-extraction-planner',
      buildGraphExtractionPlannerSlots_default(),
    );
    const plan = await invokeWithParseRetry({
      invoke: () => chat.invoke(systemPrompt, text),
      schema: extractionPlanSchema,
    });
    if (plan && plan.segments.length > 0) {
      if (cache) cache.setPhase1(text, plan);
      return plan;
    }
  } catch {
    // Fall through to fixed chunking
  }

  return createFixedChunkPlan(text);
}

/** Create a simple fixed-size chunk plan as fallback. */
function createFixedChunkPlan(text: string): ExtractionPlan {
  const segments: ExtractionPlan['segments'] = [];
  const chunkSize = CHUNK_THRESHOLD;
  for (let i = 0; i < text.length; i += chunkSize) {
    segments.push({
      text: text.slice(i, i + chunkSize),
      priority: segments.length + 1,
    });
  }
  return { segments };
}
