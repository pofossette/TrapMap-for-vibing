import { afterEach, describe, expect, it } from 'vitest';
import { checkEvalOnlyMarkers } from '../check-eval-only';
import { hasEvalOnlyMarker, scanImportRefs } from '../lib/eval-import-lib';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

describe('hasEvalOnlyMarker', () => {
  it('detects the marker in a header comment', () => {
    expect(hasEvalOnlyMarker('/**\n * @eval-only — evals only.\n */\nexport const a = 1;\n')).toBe(
      true,
    );
  });

  it('returns false without the marker', () => {
    expect(hasEvalOnlyMarker('/** normal module */\nexport const a = 1;\n')).toBe(false);
  });
});

describe('scanImportRefs', () => {
  it('captures static, dynamic and re-export imports with line numbers', () => {
    const refs = scanImportRefs(
      'evals/a.ts',
      [
        "import { x } from '../packages/service-a/src/foo.js';",
        "import('../packages/service-a/src/bar.js');",
        "export { y } from './local.js';",
        "// import { z } from '../packages/service-a/src/commented.js';",
      ].join('\n'),
    );
    expect(refs.map((r) => r.importPath)).toEqual([
      '../packages/service-a/src/foo.js',
      '../packages/service-a/src/bar.js',
      './local.js',
    ]);
    expect(refs[0]?.line).toBe(1);
    expect(refs[1]?.line).toBe(2);
  });
});

describe('checkEvalOnlyMarkers', () => {
  it('fails when an eval-only module has no @eval-only marker', () => {
    const root = makeTempRepo('trapmap-eval-only-');
    // Only evals references the module: no product import, not in index.
    write(root, 'packages/service-a/src/unmarked.ts', 'export const z = 1;\n');
    write(root, 'evals/runner.ts', "import { z } from '../packages/service-a/src/unmarked.js';\n");
    // A public module re-exported from the package index needs no marker.
    write(root, 'packages/service-a/src/public.ts', 'export const p = 1;\n');
    write(
      root,
      'packages/service-a/src/index.ts',
      "export { p } from './public.js';\nexport { q } from './migrations.js';\n",
    );
    write(root, 'packages/service-a/src/migrations.ts', 'export const q = 1;\n');
    // A module referenced by product code needs no marker.
    write(root, 'packages/service-a/src/product-used.ts', 'export const u = 1;\n');
    write(
      root,
      'packages/service-a/src/consumer.ts',
      "import { u } from './product-used.js';\nexport const c = u;\n",
    );
    write(
      root,
      'evals/other.ts',
      "import { u } from '../packages/service-a/src/product-used.js';\nimport { p } from '../packages/service-a/src/public.js';\n",
    );

    const result = checkEvalOnlyMarkers(root);
    expect(result.failures).toBe(1);
    expect(result.messages[0]).toContain('packages/service-a/src/unmarked.ts');
    expect(result.messages[0]).toContain('@eval-only');
  });

  it('passes when every eval-only module carries the marker', () => {
    const root = makeTempRepo('trapmap-eval-only-');
    write(
      root,
      'packages/service-a/src/marked.ts',
      '/**\n * @eval-only — product code has zero consumers.\n */\nexport const m = 1;\n',
    );
    write(root, 'evals/runner.ts', "import { m } from '../packages/service-a/src/marked.js';\n");
    // Contracts and host-local imports are out of the eval-only scope.
    write(root, 'packages/contracts/src/domain/evals/report.ts', 'export const r = 1;\n');
    write(
      root,
      'evals/contracts.ts',
      "import { r } from '../packages/contracts/src/domain/evals/report.js';\n",
    );
    write(root, 'packages/host-local/src/nest/config/config.ts', 'export const c = 1;\n');
    write(
      root,
      'packages/host-local/src/index.ts',
      "export { c } from './nest/config/config.js';\n",
    );
    write(
      root,
      'evals/host.ts',
      "import { c } from '../packages/host-local/src/nest/config/config.js';\n",
    );

    const result = checkEvalOnlyMarkers(root);
    expect(result.failures).toBe(0);
  });
});
