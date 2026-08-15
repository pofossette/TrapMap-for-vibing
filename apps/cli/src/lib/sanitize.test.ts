import { describe, expect, it } from 'vitest';
import { sanitizeForDisplay, stripAnsi, stripNewlines } from './sanitize.js';

describe('stripNewlines', () => {
  it('replaces newlines with spaces', () => {
    expect(stripNewlines('hello\nworld')).toBe('hello world');
    expect(stripNewlines('a\r\nb')).toBe('a b');
  });
  it('handles multiple consecutive newlines', () => {
    expect(stripNewlines('a\n\n\nb')).toBe('a b');
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  it('handles strings without ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('sanitizeForDisplay', () => {
  it('strips both newlines and ANSI', () => {
    expect(sanitizeForDisplay('\x1b[31mhello\nworld\x1b[0m')).toBe('hello world');
  });
});
