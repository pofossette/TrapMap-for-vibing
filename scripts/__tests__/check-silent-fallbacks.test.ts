import { afterEach, describe, expect, it } from 'vitest';

import { scanSilentFallbacks, workWithoutLogging } from '../check-silent-fallbacks';
import { cleanupTempRepos, makeTempRepo, write } from './helpers/temp-repo';

afterEach(() => {
  cleanupTempRepos();
});

describe('workWithoutLogging', () => {
  it('treats a log call as no work, including its trailing punctuation', () => {
    expect(workWithoutLogging(`console.error('boom', error);`)).toBe('');
    expect(workWithoutLogging(`logger.warn('boom');`)).toBe('');
    expect(
      workWithoutLogging(`
        console.error(
          'multi-line',
          error,
        );
      `),
    ).toBe('');
  });

  it('treats a comment-only body as no work', () => {
    expect(workWithoutLogging(`// best-effort\n`)).toBe('');
  });

  it('keeps real work visible', () => {
    expect(workWithoutLogging(`console.error(error); return null;`)).not.toBe('');
    expect(workWithoutLogging(`this.retries += 1;`)).not.toBe('');
    expect(workWithoutLogging(`throw new Error('nope');`)).not.toBe('');
  });
});

describe('scanSilentFallbacks', () => {
  it('flags a catch that only logs and falls through', () => {
    const root = makeTempRepo('silent-fallback-');
    write(
      root,
      'packages/demo/src/thing.ts',
      [
        'export function read(input: string): string | null {',
        '  try {',
        '    return input.trim();',
        '  } catch (error) {',
        "    console.error('read failed', error);",
        '  }',
        '  return null;',
        '}',
      ].join('\n'),
    );

    const result = scanSilentFallbacks(root);
    expect(result.failures).toBe(1);
    expect(result.violations[0]?.file).toBe('packages/demo/src/thing.ts');
    expect(result.violations[0]?.line).toBe(4);
  });

  it('accepts a rethrow, a metric, a typed result, and an annotation', () => {
    const root = makeTempRepo('silent-fallback-');
    write(
      root,
      'packages/demo/src/handled.ts',
      [
        'export function handled(x: number): number {',
        '  try {',
        '    return risky(x);',
        '  } catch (error) {',
        '    throw new Error(String(error));',
        '  }',
        '}',
        'export function metered(x: number): number {',
        '  try {',
        '    return risky(x);',
        '  } catch {',
        '    metrics.recordDegraded({ reason: "demo" });',
        '    return 0;',
        '  }',
        '}',
        'export function typed(x: number): boolean {',
        '  try {',
        '    return risky(x) > 0;',
        '  } catch {',
        '    return false;',
        '  }',
        '}',
        'export function annotated(x: number): number {',
        '  try {',
        '    return risky(x);',
        '  } catch {',
        '    // silent-fallback-ok: local scoring answers anyway; see RETRIEVAL.md',
        '    console.error("fell back");',
        '    return 0;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = scanSilentFallbacks(root);
    expect(result.failures).toBe(0);
    expect(result.annotated).toHaveLength(1);
  });

  it('rejects an annotation without a reason', () => {
    const root = makeTempRepo('silent-fallback-');
    write(
      root,
      'packages/demo/src/vague.ts',
      [
        'export function vague(): void {',
        '  try {',
        '    risky();',
        '  } catch {',
        '    // silent-fallback-ok:',
        '    console.error("boom");',
        '  }',
        '}',
      ].join('\n'),
    );

    // A marker with no justification is just a differently-spelled silence.
    const result = scanSilentFallbacks(root);
    expect(result.failures).toBe(1);
  });

  it('skips tests, fixtures and package-local scripts', () => {
    const root = makeTempRepo('silent-fallback-');
    const silent = [
      'export function read(): void {',
      '  try {',
      '    risky();',
      '  } catch (error) {',
      '    console.error(error);',
      '  }',
      '}',
    ].join('\n');
    write(root, 'packages/demo/src/thing.test.ts', silent);
    write(root, 'packages/demo/scripts/codegen.ts', silent);
    write(root, 'packages/demo/test/thing.ts', silent);
    write(root, 'packages/demo/dist/thing.ts', silent);

    const result = scanSilentFallbacks(root);
    expect(result.failures).toBe(0);
    expect(result.scannedFiles).toBe(0);
  });
});
