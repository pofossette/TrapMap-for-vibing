import { describe, expect, it } from 'vitest';
import { buildDevCommandArgs, resolveDevTarget } from '../run-dev';

describe('resolveDevTarget', () => {
  it('routes local-agent to the host-local dev command with the local-agent profile', () => {
    const target = resolveDevTarget(['local-agent']);

    expect(target).toEqual({
      env: { TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' },
      packageName: '@trapmap/app-light',
      scriptName: 'dev',
    });
  });

  it('routes a distributed worker alias to the owning host-distributed script', () => {
    const target = resolveDevTarget(['candidate-worker']);

    expect(target).toEqual({
      env: undefined,
      packageName: '@trapmap/app-distributed',
      scriptName: 'dev:candidate-ingestion',
    });
  });

  it('accepts the explicit distributed:* form used by existing docs', () => {
    const target = resolveDevTarget(['distributed:gateway']);

    expect(target).toEqual({
      env: undefined,
      packageName: '@trapmap/app-distributed',
      scriptName: 'dev:gateway',
    });
  });

  it('lists registry-derived target names in usage output', () => {
    expect(() => resolveDevTarget(['--help'])).toThrow('candidate-worker');
    expect(() => resolveDevTarget(['--help'])).toThrow('distributed:gateway');
  });

  it('builds a pnpm filter invocation for the resolved target', () => {
    const target = resolveDevTarget(['team-monolith']);

    expect(buildDevCommandArgs(target)).toEqual(['--filter', '@trapmap/app-light', 'dev']);
  });

  it('rejects unknown startup targets with a helpful error', () => {
    expect(() => resolveDevTarget(['unknown-host'])).toThrow('Unknown dev target');
  });

  it('rejects inherited object keys as unknown startup targets', () => {
    expect(() => resolveDevTarget(['toString'])).toThrow('Unknown dev target: toString');
  });

  it('ignores the pnpm argument separator before help flags', () => {
    expect(() => resolveDevTarget(['--', '--help'])).toThrow('Usage: pnpm dev -- <target>');
  });
});
