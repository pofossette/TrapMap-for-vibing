import { describe, expect, it, vi } from 'vitest';

import { reportEntrypointFailure } from '../testing/entrypoint.js';

describe('reportEntrypointFailure', () => {
  it('prints an Error message and marks the process as failed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const originalExitCode = process.exitCode;

    reportEntrypointFailure(new Error('expected failure'));

    expect(error).toHaveBeenCalledWith('expected failure');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
    error.mockRestore();
  });
});
