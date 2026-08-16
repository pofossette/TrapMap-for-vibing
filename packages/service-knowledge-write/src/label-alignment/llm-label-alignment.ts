/**
 * Label-alignment judgment node LLM implementation (design D8).
 *
 * Wraps the current LLM judgment (`callLlmAlignment`) with no behavior
 * change: when the chat provider is unavailable or the LLM returns an
 * invalid result, the decision falls back to 'unsure'.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type { LabelAlignmentPort } from '@trapmap/backend-core';

import { callLlmAlignment } from '../labels/llm-align.js';

export interface LlmLabelAlignmentDeps {
  chat: ChatProvider;
}

/**
 * Create the label-alignment LLM port backed by the chat provider.
 */
export function createLlmLabelAlignment(deps: LlmLabelAlignmentDeps): LabelAlignmentPort {
  return {
    async align(input) {
      if (!deps.chat.isConfigured) {
        return {
          decision: {
            decision: 'unsure',
            confidence: 0,
            reasoning: 'LLM alignment unavailable (chat not configured)',
          },
          candidates: input.candidates,
          llmSuccess: false,
        };
      }

      const decision = await callLlmAlignment(deps.chat, input);
      return decision
        ? { decision, candidates: input.candidates, llmSuccess: true }
        : {
            decision: {
              decision: 'unsure',
              confidence: 0,
              reasoning: 'LLM alignment call failed or returned invalid output',
            },
            candidates: input.candidates,
            llmSuccess: false,
          };
    },
  };
}
