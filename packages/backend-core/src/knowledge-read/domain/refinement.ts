/**
 * Knowledge-read bounded context — refinement rules.
 *
 * Pure refinement availability and prompt-assembly rules with zero
 * framework, DB or I/O imports. The service application layer renders
 * these rules around the AI chat provider call.
 */

export const REFINEMENT_MAX_SENTENCES = 3;

/** A constraint or knowledge entry rendered into the refinement prompt. */
export interface RefinementEntry {
  shortcut?: string;
  detail?: string;
}

/** Refinement is available when the chat provider is configured. */
export function isRefinementAvailable(chatProviderConfigured: boolean): boolean {
  return chatProviderConfigured;
}

/** Build the refinement prompt from global constraints and project knowledge. */
export function buildRefinementPrompt(
  query: string,
  globalConstraints: ReadonlyArray<RefinementEntry>,
  projectKnowledge: ReadonlyArray<RefinementEntry>,
): string {
  const parts: string[] = [];
  for (const item of globalConstraints) {
    parts.push(`- [Global Constraint] ${item.shortcut ?? ''}: ${item.detail ?? ''}`);
  }
  for (const item of projectKnowledge) {
    parts.push(`- [Project Knowledge] ${item.shortcut ?? ''}: ${item.detail ?? ''}`);
  }
  return `Search results for "${query}":\n${parts.join('\n')}`;
}

/** System prompt for the refinement call (single text form). */
export function buildRefinementSystemPrompt(maxSentences: number): string {
  return `You are a knowledge refinement assistant. Keep the response under ${maxSentences} sentences.`;
}

/** System prompt for the refinement call (block form). */
export function buildRefinementSystemPromptBlocks(
  maxSentences: number,
): Array<{ type: 'text'; text: string }> {
  return [
    {
      type: 'text',
      text: `You are a knowledge refinement assistant. Keep the response under ${maxSentences} sentences.`,
    },
  ];
}
