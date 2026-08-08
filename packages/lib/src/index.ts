/**
 * @trapmap/lib — shared pure-function utilities.
 *
 * Consolidates duplicated helper implementations across packages. See
 * `docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md` section 2 for
 * the migration inventory.
 */

export { nowIso, timestamp, formatDate } from './time.js';
export { timeout } from './async.js';
export { truncate } from './string.js';
export { uniq, uniqBy, chunk } from './array.js';
export { sha256 } from './hash.js';
