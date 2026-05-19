/**
 * LLM-powered conflict judgment module.
 *
 * Uses an LLM to classify whether two knowledge entries are in conflict,
 * and if so, what type of conflict (contradictory, alternative, superseded).
 *
 * Falls back to null when LLM is not configured or fails, allowing
 * the caller to use Jaccard-based detection as fallback.
 *
 * Phase 2: LLM-enhanced duplicate/conflict detection
 */

import { z } from 'zod';

import type { ChatProvider } from '../ai/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmConflictJudgment {
  /** Classification of the conflict relationship */
  conflictType: 'contradictory' | 'alternative' | 'superseded' | 'none';
  /** Confidence score between 0 and 1 */
  confidence: number;
  /** Human-readable explanation of the judgment */
  reasoning: string;
  /** Optional suggested resolution strategy */
  resolution?: string | undefined;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM response validation
// ---------------------------------------------------------------------------

const llmConflictJudgmentSchema = z.object({
  conflictType: z.enum(['contradictory', 'alternative', 'superseded', 'none']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(1024),
  resolution: z.string().max(1024).optional(),
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for conflict judgment.
 */
function buildConflictJudgmentSystemPrompt(): string {
  return `You are a conflict detection assistant for a knowledge management system.

Your task is to determine whether two knowledge entries are in conflict with each other.

Classification rules:
- "contradictory": The entries directly oppose each other. One says to do X, the other says to avoid X. They cannot both be true in the same context.
- "alternative": The entries address the same problem but propose different valid approaches. Both could be correct depending on context (e.g., "use REST" vs "use GraphQL").
- "superseded": One entry explicitly replaces or updates the other. The newer approach makes the older one obsolete.
- "none": The entries do not conflict. They may address different problems, or complement each other without contradiction.

Respond with ONLY valid JSON (no markdown fences, no explanation) in this exact format:
{
  "conflictType": "contradictory" | "alternative" | "superseded" | "none",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "resolution": "optional suggested resolution strategy"
}`;
}

/**
 * Build the user message containing both entries for comparison.
 */
function buildConflictJudgmentUserMessage(
  entryA: { title: string; body: string },
  entryB: { title: string; body: string },
): string {
  return `Compare these two knowledge entries for conflicts:

--- ENTRY A ---
Title: ${entryA.title}
Body: ${entryA.body}
--- END ENTRY A ---

--- ENTRY B ---
Title: ${entryB.title}
Body: ${entryB.body}
--- END ENTRY B ---

Are these entries in conflict? Classify the conflict type and provide your judgment as JSON.`;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Strip markdown code fences from LLM response text.
 */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
}

/**
 * Parse and validate an LLM response into a LlmConflictJudgment.
 * Returns null if parsing or validation fails.
 */
export function parseConflictJudgmentResponse(raw: string): LlmConflictJudgment | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned);
    const result = llmConflictJudgmentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Ask the LLM to judge whether two entries are in conflict.
 *
 * Uses the ChatProvider.invoke() pattern with retry on transient failures.
 * Returns null if:
 * - chat.isConfigured is false
 * - LLM call fails after retries
 * - Response cannot be parsed or validated
 *
 * @param chat - Chat provider for LLM calls
 * @param entryA - First entry (title + body)
 * @param entryB - Second entry (title + body)
 * @returns Conflict judgment or null on failure
 */
export async function judgeConflictWithLLM(
  chat: ChatProvider,
  entryA: { title: string; body: string },
  entryB: { title: string; body: string },
): Promise<LlmConflictJudgment | null> {
  if (!chat.isConfigured) return null;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const systemPrompt = buildConflictJudgmentSystemPrompt();
      const userMessage = buildConflictJudgmentUserMessage(entryA, entryB);
      const response = await chat.invoke(systemPrompt, userMessage);
      return parseConflictJudgmentResponse(response);
    } catch {
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 400ms
        await new Promise((r) => setTimeout(r, 100 * 2 ** (attempt * 2)));
      }
    }
  }

  return null;
}
