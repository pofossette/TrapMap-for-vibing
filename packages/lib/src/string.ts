/**
 * String helpers: truncation and normalization.
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

/**
 * Normalize a label into a stable, hyphen-delimited ID fragment.
 *
 * Unified semantics adopted from the five identical `normalizeLabel` /
 * `normalizeValue` / `normalizeGraphLabel` implementations that previously
 * lived in service-knowledge-write labels modules, service-knowledge-read
 * graph-LLM extraction, and contracts graph-query projection helpers:
 * lowercase + trim + collapse any whitespace run into a single `-`.
 *
 * NOT unified here:
 * - `graph-align.ts` in service-knowledge-write uses a different normalizer
 *   (`replace(/[^a-z0-9]+/g, '-')` plus edge-dash stripping) — it keeps
 *   alphanumeric-only fragments, so it stays at its call site.
 * - `contracts/src/domain/graph-query.ts` keeps its private copy because
 *   `contracts` cannot depend on `lib` (dependency direction `lib -> contracts`).
 */
export function normalizeLabel(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}
