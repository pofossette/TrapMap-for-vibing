import { describe, expect, it } from 'vitest';

import { createAppInfo } from './index.js';

describe('createAppInfo', () => {
  it('returns the validated placeholder app identity until B2 replaces the entrypoint', () => {
    expect(createAppInfo()).toEqual({ name: '@trapmap/app-mcp', version: '0.0.0' });
  });
});
