import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
/**
 * Phase 74 Dead Code Removal Validation Tests
 *
 * Validates QUAL-01: Remove dead code from the codebase.
 * Verifies that the 6 identified dead files are truly removed
 * and that no dangling imports or test references remain.
 */
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const PACKAGES_ROOT = path.join(PROJECT_ROOT, 'packages');

const DELETED_FILES = [
  'packages/server/src/lib/config/feature-flags.ts',
  'packages/server/src/lib/feedback/batch.ts',
  'packages/server/src/lib/feedback/quality-score.ts',
  'packages/server/src/lib/lifecycle/index.ts',
  'packages/server/src/lib/retrieval/recall/hybrid-recall.ts',
  'packages/server/src/lib/retrieval/recall/pg-vector.ts',
];

function collectFiles(rootDir: string, extensions: string[], filePaths: string[] = []): string[] {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') {
      continue;
    }

    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, extensions, filePaths);
      continue;
    }

    if (extensions.some((extension) => absolutePath.endsWith(extension))) {
      filePaths.push(absolutePath);
    }
  }

  return filePaths;
}

function findImportReferences(filePaths: string[], importPatterns: string[]): string[] {
  const importRegex = /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const matches: string[] = [];

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const match of content.matchAll(importRegex)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }

      if (importPatterns.some((pattern) => specifier.includes(pattern))) {
        matches.push(path.relative(PROJECT_ROOT, filePath));
        break;
      }
    }
  }

  return matches;
}

describe('Phase 74: Dead Code Removal (QUAL-01)', () => {
  describe('gap 1: all 6 dead files are deleted from disk', () => {
    it.each(DELETED_FILES)('%s must not exist on disk', (relativePath) => {
      const absolutePath = path.join(PROJECT_ROOT, relativePath);
      expect(fs.existsSync(absolutePath)).toBe(false);
    });
  });

  describe('gap 2: no source imports reference deleted files', () => {
    it('no TypeScript source file imports any deleted module path', () => {
      const importPatterns = [
        'config/feature-flags',
        'feedback/batch',
        'feedback/quality-score',
        'lifecycle/index',
        'recall/hybrid-recall',
        'recall/pg-vector',
      ];
      const sourceFiles = collectFiles(PACKAGES_ROOT, ['.ts', '.tsx']).filter(
        (filePath) => !filePath.endsWith('.test.ts') && !filePath.endsWith('.spec.ts') && !filePath.endsWith('.compliance.test.ts'),
      );
      const matches = findImportReferences(sourceFiles, importPatterns);

      expect(matches).toEqual([]);
    });
  });

  describe('gap 3: build and typecheck still passes', () => {
    it('TypeScript compilation succeeds with no errors after removal', () => {
      const result = cp.spawnSync('pnpm', ['exec', 'tsc', '--noEmit'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 120_000,
        shell: true,
      });

      expect(result.status).toBe(0);
    });
  });

  describe('gap 4: no test files import deleted modules', () => {
    it('no test file has an import referencing a deleted module', () => {
      const importPatterns = [
        'config/feature-flags',
        'feedback/batch',
        'feedback/quality-score',
        'recall/hybrid-recall',
        'recall/pg-vector',
      ];
      const testFiles = collectFiles(PACKAGES_ROOT, ['.test.ts', '.spec.ts', '.compliance.test.ts']);
      const matches = findImportReferences(testFiles, importPatterns);

      expect(matches).toEqual([]);
    });
  });
});
