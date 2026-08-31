import { describe, expect, it } from 'vitest';

import { canonicalJsonStringify } from '../src/canonical-json.js';

describe('canonicalJsonStringify', () => {
  it('sorts object keys while preserving array order', () => {
    const left = { b: [2, { d: 4, c: 3 }], a: 1 };
    const right = { b: [2, { c: 3, d: 4 }], a: 1 };

    expect(canonicalJsonStringify(left)).toBe('{"a":1,"b":[2,{"c":3,"d":4}]}');
    expect(canonicalJsonStringify(left)).toBe(canonicalJsonStringify(right));
  });

  it('omits undefined object properties but rejects undefined array items', () => {
    expect(canonicalJsonStringify({ a: undefined, b: null })).toBe('{"b":null}');

    expect(() => canonicalJsonStringify([undefined])).toThrow(
      'Canonical JSON cannot contain undefined in an array',
    );
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalJsonStringify({ count: Number.NaN })).toThrow(
      'Canonical JSON numbers must be finite',
    );
    expect(() => canonicalJsonStringify({ count: Number.POSITIVE_INFINITY })).toThrow(
      'Canonical JSON numbers must be finite',
    );
  });
});
