import { describe, expect, it } from 'vitest';

import { buildServer } from './app.js';

describe('identity compatibility bundle', () => {
  it('fails startup when the compatibility bridge has no identity bundle', () => {
    expect(() => buildServer()).toThrow('identity compatibility bundle');
  });

  it('fails startup when the compatibility bridge has no PostgreSQL pool', () => {
    expect(() => buildServer({ identityBundle: {} as never })).toThrow('requires PostgreSQL');
  });
});
