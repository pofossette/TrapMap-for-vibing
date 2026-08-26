/**
 * @trapmap/lib — shared pure-function utilities.
 *
 * Consolidates duplicated helper implementations across packages. See
 * `docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md` section 2 for
 * the migration inventory.
 */

export { nowIso, timestamp, formatDate } from './time.js';
export { timeout } from './async.js';
export { truncate, normalizeLabel } from './string.js';
export { uniq, uniqBy, chunk } from './array.js';
export { sha256 } from './hash.js';
export { sha256CanonicalJson } from './canonical-hash.js';
export { cosineSimilarity, createDeterministicFallbackVector, normalizeVector } from './vector.js';
export { canonicalJsonStringify } from './canonical-json.js';
export { formatStrategyGene } from './strategy-gene.js';
export { cronNextRun, cronValidate } from './cron.js';
export { asRecord } from './object.js';
export { prefixedId } from './id.js';
export {
  redactSensitiveKeys,
  redactQueryString,
  redactUrl,
  SENSITIVE_KEY_PATTERN,
} from './redact.js';
export {
  parseMarkdownFrontmatter,
  parseSkillMarkdown,
  detectMediaType,
  isTextLikeMediaType,
} from './parsing.js';
export type { ParsedMarkdownFrontmatter, ParsedSkillMarkdown, FeedbackPrompt } from './parsing.js';
