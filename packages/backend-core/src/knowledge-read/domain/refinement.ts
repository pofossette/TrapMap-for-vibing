/**
 * Knowledge-read bounded context — refinement rules.
 *
 * Pure refinement availability and prompt-assembly rules with zero
 * framework, DB or I/O imports. The service application layer renders
 * these rules around the AI chat provider call.
 */

export const REFINEMENT_MAX_SENTENCES = 3;

/** Refinement is available when the chat provider is configured. */
export function isRefinementAvailable(chatProviderConfigured: boolean): boolean {
  return chatProviderConfigured;
}

/** Build the refinement prompt from global constraints and project knowledge. */
export function buildRefinementPrompt(
  query: string,
  globalConstraints: ReadonlyArray<unknown>,
  projectKnowledge: ReadonlyArray<unknown>,
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
