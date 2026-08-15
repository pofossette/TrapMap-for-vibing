import { describe, expect, it } from 'vitest';

import { appRoutes } from './router';

describe('appRoutes', () => {
  it('includes the required admin routes', () => {
    expect(appRoutes).toEqual([
      '/',
      '/reviews',
      '/reviews/:id',
      '/artifacts',
      '/trap-graph',
      '/skill-graph',
      '/activity',
    ]);
  });
});
