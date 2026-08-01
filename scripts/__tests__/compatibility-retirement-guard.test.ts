import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const completedOwnerWaves = [
  'wave-1',
  'wave-2',
  'wave-3',
  'wave-4',
  'wave-6',
  'wave-7',
  'wave-8',
  'wave-9',
  'wave-10',
] as const;

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function productionCompatibilityReferences(): string[] {
  return [...listFiles(join(repoRoot, 'packages')), ...listFiles(join(repoRoot, 'scripts'))]
    .filter((file) => /\.(?:[cm]?ts|json)$|Dockerfile$/.test(file))
    .filter((file) => !file.includes('/dist/'))
    .filter((file) => !file.endsWith('/scripts/complexity-budgets.json'))
    .filter((file) => !/\.(?:test|spec)\.[cm]?ts$/.test(file))
    .filter((file) => !file.includes('/fixtures/'))
    .filter((file) => readFileSync(file, 'utf8').includes('@trapmap/server'));
}

describe('compatibility retirement guard', () => {
  it('deletes the server package and its compatibility Dockerfile', () => {
    expect(existsSync(join(repoRoot, 'packages/server'))).toBe(false);
    expect(existsSync(join(repoRoot, 'packages/server/Dockerfile'))).toBe(false);
  });

  it('has no production compatibility imports or workspace dependencies', () => {
    expect(productionCompatibilityReferences()).toEqual([]);
  });

  it('marks every owner wave complete after the server package retirement', () => {
    expect(completedOwnerWaves).toContain('wave-8');
    expect(completedOwnerWaves).toContain('wave-10');
  });
});
