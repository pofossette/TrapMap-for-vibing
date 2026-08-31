import { describe, expect, it } from 'vitest';
import { threeWayMerge } from './merge.js';
import type { SkillSnapshot } from './diff.js';

function snap(slug: string, files: Record<string,string>): SkillSnapshot {
  return { slug, files: Object.entries(files).map(([p,c]) => ({ path: p, content: c, sha256: c })) };
}

describe('threeWayMerge', () => {
  it('takes remote when local unchanged', () => {
    const base = snap('s', { 'SKILL.md': 'base' });
    const local = snap('s', { 'SKILL.md': 'base' });
    const remote = snap('s', { 'SKILL.md': 'remote' });
    const res = threeWayMerge(base, local, remote, 'manual');
    expect(res.merged.files[0]?.content).toBe('remote');
    expect(res.conflicts.length).toBe(0);
  });
  it('conflicts when both diverged', () => {
    const base = snap('s', { 'SKILL.md': 'base' });
    const local = snap('s', { 'SKILL.md': 'local' });
    const remote = snap('s', { 'SKILL.md': 'remote' });
    const res = threeWayMerge(base, local, remote, 'manual');
    expect(res.conflicts.length).toBe(1);
  });
  it('respects ours strategy', () => {
    const base = snap('s', { 'SKILL.md': 'base' });
    const local = snap('s', { 'SKILL.md': 'local' });
    const remote = snap('s', { 'SKILL.md': 'remote' });
    const res = threeWayMerge(base, local, remote, 'ours');
    expect(res.merged.files[0]?.content).toBe('local');
  });
});
