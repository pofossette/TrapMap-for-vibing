import { describe, expect, it, vi } from 'vitest';
import { SkillsShAdapter } from './skills-sh.js';

describe('SkillsShAdapter', () => {
  it('search returns empty offline gracefully', async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const original = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch; // lib type gap: test mock fetch
    const a = new SkillsShAdapter();
    const res = await a.search({ query: 'tdd', limit: 2 });
    expect(Array.isArray(res)).toBe(true);
    global.fetch = original;
  });
  it('getVersions returns array offline', async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ versions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const original = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch; // lib type gap: test mock fetch
    const a = new SkillsShAdapter();
    const v = await a.getVersions({ kind: 'skills-sh', raw: 'tdd', canonical: 'tdd', slug: 'tdd' });
    expect(Array.isArray(v)).toBe(true);
    global.fetch = original;
  });
});
