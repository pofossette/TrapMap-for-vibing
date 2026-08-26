import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { sha256CanonicalJson } from './canonical-hash.js';
import { canonicalJsonStringify } from './canonical-json.js';

describe('sha256CanonicalJson', () => {
  it('hashes the canonical JSON representation', () => {
    const value = { b: [2, { d: 4, c: 3 }], a: 1 };
    const expected = createHash('sha256').update(canonicalJsonStringify(value)).digest('hex');

    expect(sha256CanonicalJson(value)).toBe(expected);
    expect(sha256CanonicalJson({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(expected);
  });
});
