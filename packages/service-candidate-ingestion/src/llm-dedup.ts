/**
 * LLM-powered duplicate judgment module.
 *
 * Uses an LLM to classify whether a candidate submission is a duplicate
 * of an existing knowledge entry. Returns a structured judgment with
 * overlap type (exact/semantic/none), confidence score, and reasoning.
 *
 * Falls back to null when LLM is not configured or fails, allowing
 * the caller to use Jaccard-based detection as fallback.
 *
 * Phase 2: LLM-enhanced duplicate/conflict detection
 */

import { z } from 'zod';

import type { ChatProvider } from '@trapmap/ai-providers';
import { stripCodeFences } from '@trapmap/ai-providers/ai-parse.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmDuplicateJudgment {
  /** Whether the candidate is considered a duplicate of the existing entry */
  isDuplicate: boolean;
  /** Confidence score between 0 and 1 */
  confidence: number;
  /** Classification of the overlap relationship */
  overlapType: 'exact' | 'semantic' | 'none';
  /** Human-readable explanation of the judgment */
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM response validation
// ---------------------------------------------------------------------------

const llmDuplicateJudgmentSchema = z.object({
  isDuplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  overlapType: z.enum(['exact', 'semantic', 'none']),
  reasoning: z.string().min(1).max(1024),
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for duplicate judgment.
 */
function buildDuplicateJudgmentSystemPrompt(): string {
  return `You are a duplicate detection assistant for a knowledge management system.

Your task is to determine whether a candidate knowledge entry is a duplicate of an existing entry.

Classification rules:
- "exact": The candidate conveys the same information as the existing entry, possibly with minor wording differences. They are substantively identical.
- "semantic": The candidate addresses the same problem or topic as the existing entry, with meaningful overlap in content, but has distinct details or perspective. They could coexist but users would see significant redundancy.
- "none": The candidate covers a different topic or problem. Overlap is superficial (e.g., shared tool names or generic terms) but the actual knowledge is distinct.

Respond with ONLY valid JSON (no markdown fences, no explanation) in this exact format:
{
  "isDuplicate": true or false,
  "confidence": 0.0 to 1.0,
  "overlapType": "exact" | "semantic" | "none",
  "reasoning": "brief explanation"
}`;
}

/**
 * Build the user message containing the candidate and existing entry for comparison.
 */
function buildDuplicateJudgmentUserMessage(
  candidate: { title: string; body: string },
  existing: { title: string; body: string },
): string {
  return `Compare these two knowledge entries:

--- CANDIDATE ---
Title: ${candidate.title}
Body: ${candidate.body}
--- END CANDIDATE ---

--- EXISTING ENTRY ---
Title: ${existing.title}
Body: ${existing.body}
--- END EXISTING ENTRY ---

Are these duplicates? Classify the overlap type and provide your judgment as JSON.`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parse and validate an LLM response into a LlmDuplicateJudgment.
 * Returns null if parsing or validation fails.
 */
export function parseDuplicateJudgmentResponse(raw: string): LlmDuplicateJudgment | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned);
    const result = llmDuplicateJudgmentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Ask the LLM to judge whether a candidate is a duplicate of an existing entry.
 *
 * Uses the ChatProvider.invoke() pattern with retry on transient failures.
 * Returns null if:
 * - chat.isConfigured is false
 * - LLM call fails after retries
 * - Response cannot be parsed or validated
 *
 * @param chat - Chat provider for LLM calls
 * @param candidate - The new candidate entry (title + body)
 * @param existing - The existing entry to compare against (title + body)
 * @returns Duplicate judgment or null on failure
 */
export async function judgeDuplicateWithLLM(
  chat: ChatProvider,
  candidate: { title: string; body: string },
  existing: { title: string; body: string },
): Promise<LlmDuplicateJudgment | null> {
  if (!chat.isConfigured) return null;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = buildDuplicateJudgmentSystemPrompt();
      const userMessage = buildDuplicateJudgmentUserMessage(candidate, existing);
      const response = await chat.invoke(systemPrompt, userMessage);
      return parseDuplicateJudgmentResponse(response);
    } catch {
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 400ms
        await new Promise((r) => setTimeout(r, 100 * 2 ** (attempt * 2)));
      }
    }
  }

  return null;
}
