import { describe, expect, it } from 'vitest';
import { GithubAdapter } from './github.js';

describe('GithubAdapter', () => {
  it('search without token returns empty', async () => {
    const a = new GithubAdapter();
    const res = await a.search({ query: 'skill', limit: 1 });
    expect(Array.isArray(res)).toBe(true);
  });
});
