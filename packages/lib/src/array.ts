/**
 * Array helpers: deduplication and chunking.
 */

/**
 * Deduplicate items by identity (strict equality), keeping the first
 * occurrence of each item.
 */
export function uniq<T>(items: readonly T[]): T[] {
  return uniqBy(items, (item) => item);
}

/**
 * Deduplicate items by a key function, keeping the first occurrence of each
 * key. Semantics match the previous `deduplicateLabels` helper in
 * service-knowledge-write (first occurrence wins).
 */
export function uniqBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(item);
    }
  }
  return result;
}

/**
 * Split an array into chunks of at most `size` items. Returns `[]` when
 * `size <= 0`; returns the whole array as a single chunk when
 * `size >= items.length`.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
