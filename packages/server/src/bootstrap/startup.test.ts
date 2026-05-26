import { describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';

describe('startup sequence', () => {
  it('initializes repos before candidate recovery', async () => {
    const server = buildServer();
    const logSpy = vi.spyOn(server.log, 'error');

    await server.ready();

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Failed to check for interrupted candidates',
    );

    await server.close();
  });
});
