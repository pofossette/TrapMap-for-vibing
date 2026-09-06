import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalAdapter } from './local.js';

describe('LocalAdapter', () => {
  it('fetches local skill dir', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'local-test-'));
    const dir = path.join(tmp, 'skill-a');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), '# A', 'utf-8');
    const a = new LocalAdapter();
    const bundle = await a.fetchBundle({
      kind: 'local-path',
      raw: dir,
      canonical: dir,
      slug: 'skill-a',
    });
    expect(bundle.files.length).toBe(1);
    expect(bundle.files[0]?.path).toBe('SKILL.md');
    await rm(tmp, { recursive: true, force: true });
  });
});
