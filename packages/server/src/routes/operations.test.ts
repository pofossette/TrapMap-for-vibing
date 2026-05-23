import { describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';

describe('operations routes', () => {
  it('registers all operation sub-routes', async () => {
    const app = buildServer();
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/meta/routes',
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    // Verify key operation routes are registered
    expect(json.documentedRoutes).toContain('GET /v1/operations/knowledge');
    expect(json.documentedRoutes).toContain('POST /v1/operations/knowledge/:entryId/deactivate');
    expect(json.documentedRoutes).toContain('GET /v1/operations/audit');
    expect(json.documentedRoutes).toContain('POST /v1/operations/import');
    expect(json.documentedRoutes).toContain('POST /v1/operations/export');
    await app.close();
  });
});
