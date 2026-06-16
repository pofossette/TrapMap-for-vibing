import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVitestCommandArgs, resolveVitestFileTarget } from '../run-vitest-file';

function createRepoFixture(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'trapmap-vitest-file-'));
  mkdirSync(join(repoRoot, 'packages/server/src/lib/runtime'), { recursive: true });
  mkdirSync(join(repoRoot, 'packages/contracts/src'), { recursive: true });
  mkdirSync(join(repoRoot, 'evals/retrieval/lib'), { recursive: true });
  mkdirSync(join(repoRoot, 'scripts/__tests__'), { recursive: true });

  writeFileSync(join(repoRoot, 'packages/server/src/lib/runtime/metrics.test.ts'), 'export {};');
  writeFileSync(join(repoRoot, 'packages/contracts/src/index.test.ts'), 'export {};');
  writeFileSync(join(repoRoot, 'evals/retrieval/lib/metrics.test.ts'), 'export {};');
  writeFileSync(join(repoRoot, 'scripts/__tests__/check-doc-drift.test.ts'), 'export {};');

  return repoRoot;
}

describe('resolveVitestFileTarget', () => {
  it('routes a repo-root-relative server file to the server project', () => {
    const repoRoot = createRepoFixture();
    const target = resolveVitestFileTarget(
      'packages/server/src/lib/runtime/metrics.test.ts',
      repoRoot,
      repoRoot,
    );

    expect(target.projectName).toBe('server');
    expect(target.repoRelativePath).toBe('packages/server/src/lib/runtime/metrics.test.ts');
    expect(target.projectFilePath).toBe('src/lib/runtime/metrics.test.ts');
  });

  it('routes a cwd-relative file inside a package to the owning project', () => {
    const repoRoot = createRepoFixture();
    const packageCwd = join(repoRoot, 'packages/contracts');
    const target = resolveVitestFileTarget('src/index.test.ts', repoRoot, packageCwd);

    expect(target.projectName).toBe('contracts');
    expect(target.repoRelativePath).toBe('packages/contracts/src/index.test.ts');
    expect(target.projectFilePath).toBe('src/index.test.ts');
  });

  it('builds an exact project-scoped vitest invocation', () => {
    const repoRoot = createRepoFixture();
    const target = resolveVitestFileTarget(
      'evals/retrieval/lib/metrics.test.ts',
      repoRoot,
      repoRoot,
    );

    expect(buildVitestCommandArgs(target)).toEqual([
      'exec',
      'vitest',
      'run',
      '--project',
      'evals',
      'retrieval/lib/metrics.test.ts',
    ]);
  });

  it('rejects files outside supported project roots', () => {
    const repoRoot = createRepoFixture();
    const outsider = resolve(repoRoot, 'README.test.ts');
    writeFileSync(outsider, 'export {};');

    expect(() => resolveVitestFileTarget('README.test.ts', repoRoot, repoRoot)).toThrow(
      'supported Vitest project root',
    );
  });

  it('rejects missing files with a clear error', () => {
    const repoRoot = createRepoFixture();

    expect(() =>
      resolveVitestFileTarget(
        'packages/server/src/lib/runtime/missing.test.ts',
        repoRoot,
        repoRoot,
      ),
    ).toThrow('Test file not found');
  });
});
