import { describe, expect, it } from 'vitest';
import { type EvalSuite, buildEvalCommandArgs, resolveEvalTarget } from '../run-eval';

function resolveSuite(
  suite: EvalSuite,
  extraArgs: readonly string[] = [],
): ReturnType<typeof resolveEvalTarget> {
  return resolveEvalTarget([suite, ...extraArgs]);
}

describe('resolveEvalTarget', () => {
  it('routes smoke to the aggregate eval runner', () => {
    const target = resolveEvalTarget(['smoke']);

    expect(target.scriptPath).toBe('evals/scripts/eval-all.ts');
    expect(target.args).toEqual(['--tier', 'smoke']);
  });

  it('routes retrieval core to the retrieval runner', () => {
    const target = resolveSuite('retrieval', ['--tier', 'core']);

    expect(target.scriptPath).toBe('evals/retrieval/run.ts');
    expect(target.args).toEqual(['--tier', 'core']);
  });

  it('preserves dry-run mode for agent-planning', () => {
    const target = resolveSuite('agent-planning', ['--tier', 'core', '--dry-run']);

    expect(target.scriptPath).toBe('evals/agent-planning/run.ts');
    expect(target.args).toEqual(['--tier', 'core', '--dry-run']);
  });

  it('maps label-alignment mode onto the existing runner flags', () => {
    const target = resolveSuite('label-alignment', ['--tier', 'smoke', '--mode', 'dry-run']);

    expect(target.scriptPath).toBe('evals/label-alignment/run.ts');
    expect(target.args).toEqual(['--tier', 'smoke', '--mode', 'dry-run']);
  });

  it('keeps graph-extraction defaulting to the full fixture set', () => {
    const target = resolveSuite('graph-extraction');

    expect(target.scriptPath).toBe('evals/graph-extraction/run.ts');
    expect(target.args).toEqual([]);
  });

  it('maps ingestion smoke onto the legacy boolean flag', () => {
    const target = resolveSuite('ingestion', ['--tier', 'smoke', '--dry-run']);

    expect(target.scriptPath).toBe('evals/ingestion/run.ts');
    expect(target.args).toEqual(['--smoke', '--dry-run']);
  });

  it('builds an exact tsx invocation for aggregate json output', () => {
    const target = resolveSuite('all', [
      '--tier',
      'core',
      '--json',
      '--json-path',
      './reports/eval-report.json',
      '--platform',
      'langfuse',
      '--platform-output-dir',
      './reports/platform-events',
    ]);

    expect(buildEvalCommandArgs(target)).toEqual([
      'exec',
      'tsx',
      '--tsconfig',
      'tsconfig.base.json',
      'evals/scripts/eval-all.ts',
      '--tier',
      'core',
      '--json',
      '--json-path',
      './reports/eval-report.json',
      '--platform',
      'langfuse',
      '--platform-output-dir',
      './reports/platform-events',
    ]);
  });

  it('rejects platform flags for non-aggregate suites instead of silently ignoring them', () => {
    expect(() => resolveSuite('retrieval', ['--platform', 'json-archive'])).toThrow(
      /only supported for aggregate suites/i,
    );
    expect(() =>
      resolveSuite('summary', ['--platform-output-dir', './reports/platform-events']),
    ).toThrow(/only supported for aggregate suites/i);
  });

  it('rejects unsupported suite names with a helpful error', () => {
    expect(() => resolveEvalTarget(['unknown-suite'])).toThrow('Unknown eval suite');
  });

  it('ignores the pnpm argument separator before help flags', () => {
    expect(() => resolveEvalTarget(['--', '--help'])).toThrow(
      'Usage: pnpm eval -- <suite> [options]',
    );
  });
});
