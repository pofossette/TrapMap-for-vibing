import { describe, expect, it } from 'vitest';

import { asRecord } from './object.js';

describe('asRecord', () => {
  it('returns the input for plain objects', () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
  });

  it('returns {} for null and primitives', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord('text')).toEqual({});
    expect(asRecord(42)).toEqual({});
  });

  it('returns {} for arrays', () => {
    expect(asRecord([1, 2, 3])).toEqual({});
  });

  it('returns {} for functions', () => {
    expect(asRecord(() => undefined)).toEqual({});
  });
});
