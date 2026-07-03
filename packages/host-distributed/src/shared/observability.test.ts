import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { attachRuntimeMetricsRoute } from './observability.js';

describe('attachRuntimeMetricsRoute', () => {
  it('serves prometheus metrics for distributed worker processes', async () => {
    const app = Fastify();
    attachRuntimeMetricsRoute(app);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('trapmap_process_resident_memory_bytes');

    await app.close();
  });
});
