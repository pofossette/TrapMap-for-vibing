import { describe, expect, it } from 'vitest';

import { createDuplicateCaseId, createPrefixedId, createQueryId } from './ids.js';

describe('ids', () => {
  it('creates prefixed ids with the expected alphabet', () => {
    expect(createPrefixedId('custom')).toMatch(/^custom_[a-z0-9]{12}$/);
  });

  it('creates query ids with the qry prefix', () => {
    expect(createQueryId()).toMatch(/^qry_[a-z0-9]{12}$/);
  });

  it('creates duplicate-case ids with the dupcase prefix', () => {
    expect(createDuplicateCaseId()).toMatch(/^dupcase_[a-z0-9]{12}$/);
  });

  it('generates unique ids across repeated calls', () => {
    const ids = new Set<string>();

    for (let index = 0; index < 100; index += 1) {
      ids.add(createQueryId());
      ids.add(createDuplicateCaseId());
    }

    expect(ids.size).toBe(200);
  });
});
