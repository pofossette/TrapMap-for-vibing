import { describe, expect, it } from 'vitest';

import { chunk, uniq, uniqBy } from '../src/array.js';

describe('uniq', () => {
  it('removes duplicates by identity, keeping first occurrence', () => {
    expect(uniq([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    expect(uniq(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('handles empty input', () => {
    expect(uniq([])).toEqual([]);
  });
});

describe('uniqBy', () => {
  it('deduplicates by key, keeping the first occurrence', () => {
    const items = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'a', v: 3 },
    ];
    expect(uniqBy(items, (item) => item.id)).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ]);
  });

  it('does not coerce keys (strict equality)', () => {
    expect(uniqBy([1, '1', 1], (value) => value)).toEqual([1, '1']);
  });

  it('handles empty input', () => {
    expect(uniqBy([], (item) => item)).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into chunks of the given size, last chunk may be smaller', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns the whole array as one chunk when size >= length', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns [] for size <= 0', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([]);
    expect(chunk([1, 2, 3], -1)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(chunk([], 2)).toEqual([]);
  });
});
