/**
 * LLM refinement generation logic for the retrieval orchestrator.
 *
 * Extracted from orchestrator.ts to isolate refinement from recall and routing.
 */

import {
  buildKnowledgeRefinementSystemPrompt,
  buildKnowledgeRefinementSystemPromptBlocks,
} from '../../ai/prompts.js';
import type { SkillShareerServices } from '../../context.js';

/**
 * Check if a refinement provider is configured.
 * Returns true if a chat model is available for refinement.
 */
export function isRefinementAvailable(services: SkillShareerServices): boolean {
  return services.ai.chat.isConfigured;
}

/**
 * Build a refinement prompt from search results.
 */
export function buildRefinementPrompt(
  query: string,
  globalConstraints: unknown[],
  projectKnowledge: unknown[],
): string {
  const parts: string[] = [];
  for (const item of globalConstraints) {
    const m = item as { shortcut?: string; detail?: string };
    parts.push(`- [Global Constraint] ${m.shortcut ?? ''}: ${m.detail ?? ''}`);
  }
  for (const item of projectKnowledge) {
    const m = item as { shortcut?: string; detail?: string };
    parts.push(`- [Project Knowledge] ${m.shortcut ?? ''}: ${m.detail ?? ''}`);
  }
  return `Search results for "${query}":\n${parts.join('\n')}`;
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
    if (services.ai.chat.invokeWithBlocks) {
      const blocks = buildKnowledgeRefinementSystemPromptBlocks({ maxSentences: 3 });
      return await services.ai.chat.invokeWithBlocks(blocks, userMessage);
    }
    return await services.ai.chat.invoke(
      buildKnowledgeRefinementSystemPrompt({ maxSentences: 3 }),
      userMessage,
    );
  } catch {
    return null;
  }
}
