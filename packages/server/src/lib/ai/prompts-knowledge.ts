/**
 * Knowledge refinement and claim verification prompt slots and exported builders.
 */

import { buildSystemPromptBlocks, type PromptBlock } from './cache/api-integration.js';
import { buildPrompt, buildPromptWithCacheControl } from './prompt-builder.js';
import type { PromptSlots } from './providers/types.js';

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------

function buildKnowledgeRefinementSlots(config?: { maxSentences?: number }): PromptSlots {
  const maxSentences = config?.maxSentences ?? 3;
  return {
    role: 'a knowledge refinement assistant',
    task: 'Given search results, produce a concise summary that highlights the most relevant information.',
    corePrinciples: [
      'Prioritize the most actionable or constraining facts.',
      'Avoid repeating the search results verbatim unless necessary for clarity.',
    ],
    constraints: [`Keep the response under ${maxSentences} sentences.`],
    metadata: {
      taskType: 'knowledge-refinement',
      title: 'Knowledge Refinement',
    },
  };
}

function buildClaimVerificationSlots(config?: { strict?: boolean }): PromptSlots {
  const strict = config?.strict ?? true;
  return {
    role: 'a claim verification assistant',
    task: 'Verify whether claims from a summary are supported by the provided context and provide evidence when available.',
    corePrinciples: [
      strict
        ? 'Be strict: only mark a claim as supported if the context directly supports it.'
        : 'Mark a claim as supported only when the context supports it.',
      'Do not rely on outside knowledge.',
    ],
    metadata: {
      taskType: 'claim-verification',
      title: 'Claim Verification',
    },
  };
}

// ---------------------------------------------------------------------------
// Exported prompt builders
// ---------------------------------------------------------------------------

export function buildKnowledgeRefinementSystemPrompt(config?: {
  maxSentences?: number;
}): string {
  return buildPrompt('knowledge-refinement', buildKnowledgeRefinementSlots(config));
}

export function buildClaimVerificationSystemPrompt(config?: {
  strict?: boolean;
}): string {
  return buildPrompt('claim-verification', buildClaimVerificationSlots(config));
}

export function buildKnowledgeRefinementSystemPromptBlocks(config?: {
  maxSentences?: number;
}): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'knowledge-refinement',
    buildKnowledgeRefinementSlots(config),
  );
  return buildSystemPromptBlocks(sections);
}
