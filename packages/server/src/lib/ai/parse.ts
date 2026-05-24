/**
 * Shared LLM response parsing helpers.
 *
 * @module ai/parse
 */

/**
 * Strip markdown code fences from an LLM response.
 *
 * Handles the common pattern where LLMs wrap JSON in triple backticks:
 *   ```json\n{...}\n```  →  {...}
 *
 * @param raw - Raw LLM response text
 * @returns Response with code fences removed
 */
export function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
}
