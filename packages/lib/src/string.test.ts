import { describe, expect, it } from 'vitest';

import { truncate } from './string.js';

describe('truncate', () => {
  it('returns text unchanged when within maxLength', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('truncates with the ellipsis inside the limit', () => {
    expect(truncate('abcdefghij', 5)).toBe('ab...');
  });

  it('never exceeds maxLength', () => {
    expect(truncate('abcdefghij', 5).length).toBe(5);
    expect(truncate('abcdefghij', 120).length).toBeLessThanOrEqual(120);
  });

  it('cuts without ellipsis when maxLength <= 3', () => {
    expect(truncate('hello', 3)).toBe('hel');
    expect(truncate('hello', 2)).toBe('he');
    expect(truncate('hello', 1)).toBe('h');
  });

  it('handles maxLength 0', () => {
    expect(truncate('hello', 0)).toBe('');
  });

  it('handles empty text', () => {
    expect(truncate('', 5)).toBe('');
  });
});
