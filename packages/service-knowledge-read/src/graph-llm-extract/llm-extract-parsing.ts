/**
 * JSON parsing helpers for LLM extraction responses.
 *
 * Handles code-fence stripping, JSON parsing, and Zod validation
 * for both graph extraction and extraction plan payloads.
 */

import type { ExtractionPlan, LlmGraphExtraction } from '@trapmap/contracts';
import { extractionPlanSchema, llmGraphExtractionSchema } from '@trapmap/contracts';
import type { ZodType } from 'zod';

import { parseJsonWithSchema } from '@trapmap/ai-providers/ai-parse.js';

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

/** Parse LLM JSON response and validate with Zod. Returns null on failure. */
export function parseLlmExtraction(raw: string): LlmGraphExtraction | null {
  return parseJsonWithSchema(
    raw,
    llmGraphExtractionSchema as unknown as ZodType<LlmGraphExtraction>,
  );
}

/** Parse LLM JSON response as an extraction plan. Returns null on failure. */
export function parseExtractionPlan(raw: string): ExtractionPlan | null {
  return parseJsonWithSchema(raw, extractionPlanSchema as unknown as ZodType<ExtractionPlan>);
}
