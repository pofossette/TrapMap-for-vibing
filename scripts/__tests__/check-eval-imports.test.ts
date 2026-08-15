import { afterEach, describe, expect, it } from 'vitest';
import { checkEvalImports, classifyImport } from '../check-eval-imports';
import { sourcePathFor } from '../lib/eval-import-lib';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

describe('sourcePathFor', () => {
  it('maps runtime extensions back to source files', () => {
    expect(sourcePathFor('packages/a/src/b.js')).toBe('packages/a/src/b.ts');
    expect(sourcePathFor('packages/a/src/c.mjs')).toBe('packages/a/src/c.mts');
    expect(sourcePathFor('packages/a/src/d.ts')).toBe('packages/a/src/d.ts');
  });
});

describe('classifyImport', () => {
  const root = '/repo';

  it('allows packages/contracts imports', () => {
    expect(
      classifyImport(root, 'evals/x.ts', 1, 'packages/contracts/src/domain/evals/report.ts'),
    ).toBeNull();
  });

  it('allows the host-local eval allowlist', () => {
    expect(
      classifyImport(root, 'evals/x.ts', 1, 'packages/host-local/src/nest/runtime/host-runtime.ts'),
    ).toBeNull();
    expect(
      classifyImport(root, 'evals/x.ts', 1, 'packages/host-local/src/nest/config/config.ts'),
    ).toBeNull();
  });

  it('allows the documented test-facade allowlist', () => {
    expect(
      classifyImport(
        root,
        'evals/x.ts',
        1,
        'packages/service-knowledge-read/src/retrieval-read-model-cache.ts',
      ),
    ).toBeNull();
  });

  it('rejects a deep import into an unmarked service file', () => {
    const violation = classifyImport(root, 'evals/x.ts', 3, 'packages/service-a/src/pg-ports.ts');
    expect(violation).not.toBeNull();
    expect(violation?.file).toBe('evals/x.ts');
    expect(violation?.line).toBe(3);
  });
});

describe('checkEvalImports', () => {
  it('passes when evals only use allowed surfaces', () => {
    const root = makeTempRepo('trapmap-eval-imports-');
    write(root, 'evals/ok.ts', "import { x } from '@trapmap/contracts';\n");
    write(
      root,
      'evals/bridge.ts',
      "import type { HostLocalRuntime } from '../packages/host-local/src/nest/runtime/host-runtime.js';\n",
    );
    write(
      root,
      'packages/service-a/src/eval-only.ts',
      '/**\n * @eval-only — product code has zero consumers.\n */\nexport const y = 1;\n',
    );
    write(root, 'evals/runner.ts', "import('../packages/service-a/src/eval-only.js');\n");
    write(
      root,
      'evals/contracts.ts',
      "import { z } from '../packages/contracts/src/domain/evals/report.js';\n",
    );
    write(
      root,
      'evals/facade.ts',
      "import { resetRetrievalReadModelCacheForTests } from '../packages/service-knowledge-read/src/retrieval-read-model-cache.js';\n",
    );
    write(root, 'packages/service-knowledge-read/src/retrieval-read-model-cache.ts', 'export {}\n');

    const result = checkEvalImports(root);
    expect(result.failures).toBe(0);
  });

  it('fails on a deep relative import into a service internal file', () => {
    const root = makeTempRepo('trapmap-eval-imports-');
    write(
      root,
      'evals/bad.ts',
      "import { createPgStore } from '../packages/service-a/src/pg-ports.js';\n",
    );
    write(root, 'packages/service-a/src/pg-ports.ts', 'export const createPgStore = 1;\n');

    const result = checkEvalImports(root);
    expect(result.failures).toBe(1);
    expect(result.messages[0]).toContain('evals/bad.ts:1');
    expect(result.messages[0]).toContain('packages/service-a/src/pg-ports.ts');
  });

  it('ignores package-name and intra-evals imports', () => {
    const root = makeTempRepo('trapmap-eval-imports-');
    write(
      root,
      'evals/a.ts',
      "import { b } from './b.js';\nimport { c } from '@trapmap/service-a';\n",
    );
    write(root, 'evals/b.ts', 'export const b = 1;\n');

    const result = checkEvalImports(root);
    expect(result.failures).toBe(0);
  });
});
