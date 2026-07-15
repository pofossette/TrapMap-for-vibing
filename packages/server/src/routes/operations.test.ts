import { describe, expect, it } from 'vitest';

import Fastify from 'fastify';
import { operationsRoutes } from './operations.js';

describe('operations routes', () => {
  it('registers all operation sub-routes', async () => {
    const app = Fastify();
    await app.register(operationsRoutes);
    await app.ready();
    const routes = app.printRoutes();
    expect(routes).toContain('audit');
    expect(routes).toContain('knowledge');
    expect(routes).not.toContain('artifacts');
    await app.close();
  });
});
