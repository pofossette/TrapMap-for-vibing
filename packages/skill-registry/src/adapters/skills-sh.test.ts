import { describe, expect, it } from 'vitest';
import { SkillsShAdapter } from './skills-sh.js';

describe('SkillsShAdapter', () => {
  it('search returns empty offline gracefully', async () => {
    // allow network timeout
    const a = new SkillsShAdapter();
    const res = await a.search({ query: 'tdd', limit: 2 });
    expect(Array.isArray(res)).toBe(true);
  }, 10000);
  it('getVersions returns array offline', async () => {
    const a = new SkillsShAdapter();
    const v = await a.getVersions({ kind: 'skills-sh', raw: 'tdd', canonical: 'tdd', slug: 'tdd' });
    expect(Array.isArray(v)).toBe(true);
  });
});
