import { describe, expect, it } from 'vitest';
import { diffSnapshots } from './diff.js';

describe('diffSnapshots', () => {
  it('detects added/removed/modified', () => {
    const base = { slug: 's', files: [{ path: 'a.md', sha256: 'a', content: 'a' }] };
    const next = { slug: 's', files: [{ path: 'a.md', sha256: 'b', content: 'b' }, { path: 'b.md', sha256: 'c', content: 'c' }] };
    const d = diffSnapshots(base as any, next as any);
    expect(d.files.find(f=>f.path==='a.md')?.status).toBe('modified');
    expect(d.files.find(f=>f.path==='b.md')?.status).toBe('added');
  });
});
