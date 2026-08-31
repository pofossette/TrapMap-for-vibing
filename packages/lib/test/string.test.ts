import { describe, expect, it } from 'vitest';

import { normalizeLabel, truncate } from '../src/string.js';

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

describe('normalizeLabel', () => {
  it('lowercases and trims', () => {
    expect(normalizeLabel('  Hello World  ')).toBe('hello-world');
  });

  it('collapses whitespace runs into a single dash', () => {
    expect(normalizeLabel('a   b\t\nc')).toBe('a-b-c');
  });

  it('keeps existing dashes', () => {
    expect(normalizeLabel('Graph-LLM Extract')).toBe('graph-llm-extract');
  });

  it('handles empty input', () => {
    expect(normalizeLabel('')).toBe('');
  });
});
