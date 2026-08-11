/**
 * LLM refinement generation logic for the retrieval orchestrator.
 *
 * Pure refinement rules (availability judgment, prompt assembly) live in
 * the knowledge-read domain; this module keeps the provider invocation
 * orchestration around them.
 */

import {
  REFINEMENT_MAX_SENTENCES,
  buildRefinementPrompt,
  isRefinementAvailable as isRefinementProviderConfigured,
} from '@trapmap/backend-core';

import type { SkillShareerServices } from './context.js';
import { getKnowledgeReadSupportInfra } from './knowledge-read-support-infra.js';

/**
 * Check if a refinement provider is configured.
 * Returns true if a chat model is available for refinement.
 */
export function isRefinementAvailable(services: SkillShareerServices): boolean {
  return isRefinementProviderConfigured(services.ai.chat.isConfigured);
}

/**
 * Generate a refinement summary for search results.
 * This is best-effort: returns null if no provider is configured.
 *
 * @param services - Server services (for AI chat provider)
 * @param query - The original search query
 * @param globalConstraints - Matched global constraints
 * @param projectKnowledge - Matched project knowledge
 * @returns A summary string or null if refinement is unavailable
 */
export async function generateRefinement(
  services: SkillShareerServices,
  query: string,
  globalConstraints: unknown[],
  projectKnowledge: unknown[],
): Promise<string | null> {
  if (!isRefinementAvailable(services)) {
    return null;
  }

  if (globalConstraints.length === 0 && projectKnowledge.length === 0) {
    return null;
  }

  try {
    const userMessage = buildRefinementPrompt(query, globalConstraints, projectKnowledge);
    const supportInfra = getKnowledgeReadSupportInfra(services);
    if (services.ai.chat.invokeWithBlocks) {
      const blocks = supportInfra.refinement.buildSystemPromptBlocks(REFINEMENT_MAX_SENTENCES);
      return await services.ai.chat.invokeWithBlocks(blocks, userMessage);
    }
    return await services.ai.chat.invoke(
      supportInfra.refinement.buildSystemPrompt(REFINEMENT_MAX_SENTENCES),
      userMessage,
    );
  } catch {
    return null;
  }
}
