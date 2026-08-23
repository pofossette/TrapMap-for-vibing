import { describe, expect, it } from 'vitest';

import type { ReviewQueueResponse } from '@trapmap/contracts';
import { createAdminPanelApi } from './admin-panel-api';
import type { HttpClient } from './http-client';

describe('admin panel review queue transport', () => {
  it('sends every panel filter and the paging cursor to the gateway', async () => {
    const paths: string[] = [];
    const response: ReviewQueueResponse = {
      items: [],
      nextCursor: null,
      filteredTotal: 0,
      total: 0,
    };
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        return response;
      },
    };

    await createAdminPanelApi(client).loadPendingReviews({
      filters: {
        status: 'submitted',
        search: ' schema drift ',
        source: 'candidate-ingestion',
        riskLevel: 'high',
        sort: 'longest-waiting',
      },
      paging: { cursor: '25', limit: 25 },
    });

    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/v1/knowledge/review-queue');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'submitted',
      search: 'schema drift',
      source: 'candidate-ingestion',
      riskLevel: 'high',
      sort: 'longest-waiting',
      cursor: '25',
      limit: '25',
    });
  });
});
