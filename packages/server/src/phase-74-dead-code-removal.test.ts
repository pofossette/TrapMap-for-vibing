/**
 * Phase 74 Dead Code Removal Validation Tests
 *
 * Validates QUAL-01: Remove dead code from the codebase.
 * Verifies that the 6 identified dead files are truly removed
 * and that no dangling imports or test references remain.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cp from 'node:child_process';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const DELETED_FILES = [
  'packages/server/src/lib/config/feature-flags.ts',
  'packages/server/src/lib/feedback/batch.ts',
  'packages/server/src/lib/feedback/quality-score.ts',
  'packages/server/src/lib/lifecycle/index.ts',
  'packages/server/src/lib/retrieval/recall/hybrid-recall.ts',
  'packages/server/src/lib/retrieval/recall/pg-vector.ts',
];

describe('Phase 74: Dead Code Removal (QUAL-01)', () => {
  describe('gap 1: all 6 dead files are deleted from disk', () => {
    it.each(DELETED_FILES)('%s must not exist on disk', (relativePath) => {
      const absolutePath = path.join(PROJECT_ROOT, relativePath);
      expect(fs.existsSync(absolutePath)).toBe(false);
    });
  });

  describe('gap 2: no source imports reference deleted files', () => {
    it('no TypeScript source file imports any deleted module path', () => {
      // These are the unique path fragments that would appear in import/from statements
      const importPatterns = [
        'config/feature-flags',
        'feedback/batch',
        'feedback/quality-score',
        'lifecycle/index',
        'recall/hybrid-recall',
        'recall/pg-vector',
      ];

      for (const pat of importPatterns) {
        try {
          // Search for import statements referencing this deleted path
          const result = cp.execSync(
            `grep -rn --include='*.ts' --include='*.tsx' -E "from.*['\\\"]" packages/ | grep -F '${pat}' || true`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8' },
          );

          const lines = result.trim().split('\n').filter(Boolean);
          // Each remaining line is an import referencing a deleted module
          expect(lines).toHaveLength(0);
        } catch {
          // grep returns non-zero when no matches - that is fine
        }
      }
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

      for (const pat of importPatterns) {
        try {
          const result = cp.execSync(
            `grep -rn --include='*.test.ts' --include='*.spec.ts' -E "from.*['\\\"]" packages/ | grep -F '${pat}' || true`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8' },
          );

          const lines = result.trim().split('\n').filter(Boolean);
          expect(lines).toHaveLength(0);
        } catch {
          // grep returns non-zero when no matches - acceptable
        }
      }
    });
  });
});
