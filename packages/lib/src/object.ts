/**
 * Object helpers: safe record casting.
 */

/**
 * Return `value` as a plain record when it is a non-null, non-array object,
 * otherwise return an empty record.
 *
 * Unified semantics adopted from the two identical `asRecord` helpers that
 * previously lived in service-knowledge-write `knowledge-snapshot-owner.ts`
 * and `wave9-artifact-snapshot-owner.ts` (both removed with the Wave-9
 * backfill script retirement).
 *
 * NOT unified here: `isRecord` type guards in @trapmap/lib (`parsing.ts`)
 * and host-distributed (`governance-review/conflict-read.ts`)
 * keep their local forms because their array-exclusion semantics differ.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
