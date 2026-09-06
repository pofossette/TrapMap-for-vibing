/**
 * @trapmap/lib — shared pure-function utilities.
 *
 * Consolidates duplicated helper implementations across packages. See
 * `docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md` section 2 for
 * the migration inventory.
 */

export { chunk, uniq, uniqBy } from './array.js';
export { timeout } from './async.js';
export { sha256CanonicalJson } from './canonical-hash.js';
export { canonicalJsonStringify } from './canonical-json.js';
export { cronNextRun, cronValidate } from './cron.js';
export { sha256 } from './hash.js';
export { prefixedId } from './id.js';
export { asRecord } from './object.js';
export type { FeedbackPrompt, ParsedMarkdownFrontmatter, ParsedSkillMarkdown } from './parsing.js';
export {
  detectMediaType,
  isTextLikeMediaType,
  parseMarkdownFrontmatter,
  parseSkillMarkdown,
} from './parsing.js';
export {
  redactQueryString,
  redactSensitiveKeys,
  redactUrl,
  SENSITIVE_KEY_PATTERN,
} from './redact.js';
export { formatStrategyGene } from './strategy-gene.js';
export { normalizeLabel, truncate } from './string.js';
export { formatDate, nowIso, timestamp } from './time.js';
export { cosineSimilarity, createDeterministicFallbackVector, normalizeVector } from './vector.js';
