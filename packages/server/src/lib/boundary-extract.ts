import type { Boundary } from '@trapmap/contracts';
import { boundarySchema } from '@trapmap/contracts';

import {
  buildBoundaryExtractionSystemPrompt,
  buildBoundaryExtractionSystemPromptBlocks,
} from './ai/prompts.js';
import type { ChatProvider } from './ai/types.js';

/**
 * Input for boundary extraction.
 */
interface BoundaryExtractionInput {
  shortcut: string;
  detail: string;
  labels: string[];
}

/**
 * Extract candidate boundary constraints from knowledge content using LLM.
 *
 * @param chat - Chat provider for LLM invocation
 * @param input - Knowledge content to analyze
 * @returns Extracted boundary constraints, or null if extraction failed
 */
export async function extractCandidateBoundaries(
  chat: ChatProvider,
  input: BoundaryExtractionInput,
): Promise<Boundary | null> {
  // Return null if chat provider not configured
  if (!chat.isConfigured) {
    return null;
  }

  const userMessage = `Title: ${input.shortcut}

Detail:
${input.detail}

Labels: ${input.labels.join(', ')}`;

  try {
    const response = chat.invokeWithBlocks
      ? await chat.invokeWithBlocks(buildBoundaryExtractionSystemPromptBlocks(), userMessage)
      : await chat.invoke(buildBoundaryExtractionSystemPrompt(), userMessage);

    // Parse JSON response
    const parsed = JSON.parse(response);

    // Validate with boundary schema
    const boundary = boundarySchema.parse(parsed);

    return boundary;
  } catch {
    // Return null on any failure (LLM error, parse error, validation error)
    return null;
  }
}
