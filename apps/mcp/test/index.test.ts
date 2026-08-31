import { describe, expect, it } from 'vitest';

import { createAppInfo } from '../src/index.js';

describe('createAppInfo', () => {
  it('reports the app identity without starting the stdio loop on import', () => {
    expect(createAppInfo()).toEqual({ name: '@trapmap/app-mcp', version: '0.1.0' });
  });
});
