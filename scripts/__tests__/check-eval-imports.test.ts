import { afterEach, describe, expect, it } from 'vitest';
import { checkEvalImports, checkReverseEvalImports, classifyImport } from '../check-eval-imports';
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

  it('rejects deep imports into packages/contracts internals', () => {
    expect(
      classifyImport(root, 'evals/x.ts', 1, 'packages/contracts/src/domain/common.ts'),
    ).not.toBeNull();
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
    // Eval-only contracts now live inside evals/ (intra-evals import).
    write(root, 'evals/types/report.ts', 'export const r = 1;\n');
    write(root, 'evals/contracts.ts', "import { r } from './types/report.js';\n");
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

  it('fails on a deep relative import into packages/contracts internals', () => {
    const root = makeTempRepo('trapmap-eval-imports-');
    write(
      root,
      'evals/bad-contracts.ts',
      "import { z } from '../packages/contracts/src/domain/common.js';\n",
    );
    write(root, 'packages/contracts/src/domain/common.ts', 'export const z = 1;\n');

    const result = checkEvalImports(root);
    expect(result.failures).toBe(1);
    expect(result.messages[0]).toContain('evals/bad-contracts.ts:1');
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

describe('checkReverseEvalImports', () => {
  it('passes when product code never imports from evals', () => {
    const root = makeTempRepo('trapmap-eval-reverse-');
    write(root, 'packages/a/src/index.ts', "import { x } from '@trapmap/contracts';\n");
    write(root, 'packages/a/src/local.ts', "import { y } from './other.js';\n");
    write(root, 'packages/a/src/other.ts', 'export const y = 1;\n');
    write(root, 'apps/web/src/main.ts', "import { z } from '@trapmap/contracts';\n");

    const result = checkReverseEvalImports(root);
    expect(result.failures).toBe(0);
  });

  it('fails on a relative import into evals/ from packages', () => {
    const root = makeTempRepo('trapmap-eval-reverse-');
    write(root, 'evals/types/report.ts', 'export const r = 1;\n');
    write(root, 'packages/a/src/bad.ts', "import { r } from '../../../evals/types/report.js';\n");

    const result = checkReverseEvalImports(root);
    expect(result.failures).toBe(1);
    expect(result.messages[0]).toContain('packages/a/src/bad.ts:1');
    expect(result.messages[0]).toContain('evals/types/report.ts');
  });

  it('fails on retired or future evals package namespaces in product code', () => {
    const root = makeTempRepo('trapmap-eval-reverse-');
    write(root, 'packages/a/src/old.ts', "import { r } from '@trapmap/contracts/evals';\n");
    write(root, 'apps/web/src/future.ts', "import { e } from '@trapmap/evals';\n");

    const result = checkReverseEvalImports(root);
    expect(result.failures).toBe(2);
  });
});
