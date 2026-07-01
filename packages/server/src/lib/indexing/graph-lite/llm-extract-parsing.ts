/**
 * JSON parsing helpers for LLM extraction responses.
 *
 * Handles code-fence stripping, JSON parsing, and Zod validation
 * for both graph extraction and extraction plan payloads.
 */

import type { ExtractionPlan, LlmGraphExtraction } from '@trapmap/contracts';
import { extractionPlanSchema, llmGraphExtractionSchema } from '@trapmap/contracts';

import { stripCodeFences } from '@trapmap/server/lib/ai/parse.js';

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

/** Parse LLM JSON response and validate with Zod. Returns null on failure. */
export function parseLlmExtraction(raw: string): LlmGraphExtraction | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = llmGraphExtractionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Parse LLM JSON response as an extraction plan. Returns null on failure. */
export function parseExtractionPlan(raw: string): ExtractionPlan | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = extractionPlanSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
