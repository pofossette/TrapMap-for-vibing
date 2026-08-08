import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sha256 } from './hash.js';

describe('sha256', () => {
  it('matches node:crypto hex digest for buffers', () => {
    const buffer = Buffer.from('hello world');
    expect(sha256(buffer)).toBe(createHash('sha256').update(buffer).digest('hex'));
  });

  it('hashes strings as utf8 bytes', () => {
    expect(sha256('hello')).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('returns a 64-character lowercase hex string', () => {
    expect(sha256('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(sha256('content')).toBe(sha256('content'));
  });
});
