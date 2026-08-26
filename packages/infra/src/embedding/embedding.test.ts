import { describe, expect, it } from 'vitest';

import { createFallbackEmbedding, embedWithFallback } from './index.js';

describe('infra embedding', () => {
  it('creates deterministic embedding', async () => {
    const a = createFallbackEmbedding('hello world');
    const b = createFallbackEmbedding('hello world');
    expect(a).toEqual(b);
    expect(a.length).toBe(384);
  });

  it('embedWithFallback resolves', async () => {
    const v = await embedWithFallback('test seed');
    expect(v.length).toBe(384);
  });
});
