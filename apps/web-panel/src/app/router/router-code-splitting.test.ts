import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageSrc = path.resolve(currentDir, '../..');
const routerSource = readFileSync(path.join(packageSrc, 'app/router/router.tsx'), 'utf8');
const shellSource = readFileSync(path.join(packageSrc, 'app/shell/app-shell.tsx'), 'utf8');

describe('web panel route code splitting', () => {
  it('loads every route page lazily', () => {
    expect(routerSource).not.toMatch(/import \{ .*Page \} from '@trapmap\/web-panel\/pages\//);
    expect(routerSource.match(/import\('@trapmap\/web-panel\/pages\//g) ?? []).toHaveLength(7);
  });

  it('keeps a non-empty suspense boundary around routed content', () => {
    expect(shellSource).toContain('<Suspense');
    expect(shellSource).toContain('<SkeletonBlock');
  });
});
