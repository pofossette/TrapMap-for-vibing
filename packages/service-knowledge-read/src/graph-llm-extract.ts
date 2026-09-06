/**
 * @eval-only — product code has zero consumers; this module is imported
 * dynamically only by the evals graph-extraction runner (case-eval.ts).
 * It is intentionally NOT exported from the package index.
 *
 * LLM-powered graph extraction helpers.
 *
 * Provides single-segment entity extraction via LLM, consumed by the
 * graph-extraction eval runner.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import { invokeWithParseRetry } from '@trapmap/ai-providers/ai-parse.js';
import { buildGraphExtractionSlots_default, buildPrompt } from '@trapmap/ai-providers/prompts.js';
import { type LlmGraphExtraction, llmGraphExtractionSchema } from '@trapmap/contracts';
import { executeWithResilience } from './graph-llm-extract/resilience.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retry attempts per LLM call. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). */
const BACKOFF_BASE_MS = 100;

// ---------------------------------------------------------------------------
// Single-segment entity extraction
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
  try {
    return await executeWithResilience(
      'graph-llm-segment-extraction',
      () =>
        invokeWithParseRetry({
          invoke: () => chat.invoke(systemPrompt, segment),
          schema: llmGraphExtractionSchema,
          maxRetries,
          backoffMs: (attempt: number) => BACKOFF_BASE_MS * 2 ** (attempt * 2),
        }),
      { timeoutMs: 15_000, maxAttempts: maxRetries + 1 },
    );
  } catch {
    return null;
  }
}
