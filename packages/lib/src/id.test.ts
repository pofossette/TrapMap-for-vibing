import { describe, expect, it } from 'vitest';

import { prefixedId } from './id.js';

describe('prefixedId', () => {
  it('returns a prefixed hex id', () => {
    const id = prefixedId('evt');
    expect(id).toMatch(/^evt_[0-9a-f]{32}$/);
  });

  it('truncates the hex body when maxHexLength is given', () => {
    const id = prefixedId('qry', 12);
    expect(id).toMatch(/^qry_[0-9a-f]{12}$/);
  });

  it('never truncates the prefix', () => {
    const id = prefixedId('feedback', 2);
    expect(id).toMatch(/^feedback_[0-9a-f]{2}$/);
  });

  it('produces distinct ids on repeated calls', () => {
    const seen = new Set(Array.from({ length: 100 }, () => prefixedId('trap')));
    expect(seen.size).toBe(100);
  });
});
