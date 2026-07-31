import { describe, expect, it } from 'vitest';
import { buildPostgresTestServer as buildServer } from '../../../../../scripts/testing/server-test-composition.js';

describe('operations status routes', () => {
  it('requires authentication for compatibility status', async () => {
    const app = await buildServer();
    try {
      expect((await app.inject({ method: 'GET', url: '/v1/operations/status' })).statusCode).toBe(
        401,
      );
    } finally {
      await app.close();
    }
  });
});
