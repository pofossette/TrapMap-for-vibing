/**
 * Shared temp-repo fixture helpers for scripts guard unit tests.
 *
 * Guard tests operate on throwaway directory trees shaped like the real
 * repo (packages/…, evals/…, docs/…) so the pure checking functions can be
 * exercised without touching the actual repository.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirs: string[] = [];

export function makeTempRepo(prefix: string): string {
  const repoRoot = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(repoRoot);
  return repoRoot;
}

export function write(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

export function cleanupTempRepos(): void {
  for (const dir of tempDirs.splice(0)) {
    void import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
  }
}
