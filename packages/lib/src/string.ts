/**
 * String helpers: truncation.
 */

/**
 * Truncate text to a maximum length with an ellipsis.
 *
 * Unified semantics: the ellipsis (`...`) counts toward `maxLength` when the
 * text is truncated, so the result is never longer than `maxLength`. For
 * `maxLength <= 3` the text is cut without an ellipsis (the ellipsis would
 * not fit). Length is measured in JS UTF-16 code units (characters), matching
 * the previous implementations in cli and service-knowledge-read.
 *
 * NOT unified here: `truncateForPrompt` in service-knowledge-write
 * `artifact-derive/contextual-enrichment.ts` cuts at a paragraph boundary
 * (prefers the last `\n\n` before the limit) and appends no ellipsis. That
 * semantic exists to keep LLM prompt context coherent and must not gain an
 * ellipsis or lose the boundary cut, so it stays at its call site.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}
