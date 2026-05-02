import type { Boundary } from '@trapmap/contracts';
import { boundarySchema } from '@trapmap/contracts';

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

  const systemPrompt = `You are a boundary extraction assistant. Analyze the knowledge entry and extract structured boundary constraints.

A boundary defines when knowledge is applicable. Extract the following layers:

1. **context**: Situational context labels (e.g., "frontend", "production", "testing")
2. **versions**: Version constraints for tools/libraries (e.g., {package: "react", range: ">=16.8.0"})
3. **prerequisites**: Conditions that must be true before applying (e.g., "Docker installed")
4. **signals**: Patterns indicating this knowledge is relevant (e.g., error codes, log patterns)
5. **exclusions**: Conditions that make this knowledge NOT applicable
6. **evidence**: Supporting references (issues, incidents, CVEs)

Return a JSON object with this structure:
{
  "context": ["label1", "label2"],
  "versions": [{"package": "name", "range": ">=1.0.0"}],
  "prerequisites": [{"description": "condition"}],
  "signals": [{"pattern": "pattern", "kind": "keyword"}],
  "exclusions": [{"description": "exclusion"}],
  "evidence": [{"kind": "issue", "identifier": "123"}]
}

All fields are optional and default to empty arrays.
Only include constraints that are EXPLICITLY stated or clearly implied.
When in doubt, omit the constraint.`;

  const userMessage = `Title: ${input.shortcut}

Detail:
${input.detail}

Labels: ${input.labels.join(', ')}`;

  try {
    const response = await chat.invoke(systemPrompt, userMessage);

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
