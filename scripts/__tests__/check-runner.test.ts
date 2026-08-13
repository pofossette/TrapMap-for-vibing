import { describe, expect, it } from 'vitest';
import { runCheckSteps } from '../lib/check-runner.js';

describe('runCheckSteps', () => {
  it('passes when all blocking steps succeed', async () => {
    const result = await runCheckSteps([
      { name: 'ok-step', command: 'node', args: ['-e', 'process.exit(0)'] },
      { name: 'ok-step-2', command: 'node', args: ['-e', 'process.exit(0)'] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes.every((o) => o.ok)).toBe(true);
  });

  it('fails the run when a blocking step fails', async () => {
    const result = await runCheckSteps([
      { name: 'ok-step', command: 'node', args: ['-e', 'process.exit(0)'] },
      { name: 'fail-step', command: 'node', args: ['-e', 'process.exit(1)'] },
    ]);
    expect(result.ok).toBe(false);
    expect(result.outcomes.find((o) => o.name === 'fail-step')!.ok).toBe(false);
  });

  it('keeps non-blocking failures visible without failing the run', async () => {
    const result = await runCheckSteps([
      { name: 'warn-step', command: 'node', args: ['-e', 'process.exit(1)'], blocking: false },
      { name: 'ok-step', command: 'node', args: ['-e', 'process.exit(0)'] },
    ]);
    expect(result.ok).toBe(true);
    const warn = result.outcomes.find((o) => o.name === 'warn-step')!;
    expect(warn.ok).toBe(false);
    expect(warn.blocking).toBe(false);
  });
});
