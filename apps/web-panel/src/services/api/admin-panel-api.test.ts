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

describe('admin panel activity transport', () => {
  it('sends actor, time, type, search, and paging parameters', async () => {
    const paths: string[] = [];
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        return {
          events: [],
          nextCursor: null,
          filteredTotal: 0,
          total: 0,
        };
      },
    };

    await createAdminPanelApi(client).loadActivityFeed({
      actor: ' reviewer ',
      cursor: '20',
      from: '2026-06-01T00:00:00.000Z',
      limit: 20,
      search: 'schema drift',
      to: '2026-06-30T23:59:59.999Z',
      type: 'decision',
    });

    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/admin/activity');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      actor: 'reviewer',
      cursor: '20',
      from: '2026-06-01T00:00:00.000Z',
      limit: '20',
      search: 'schema drift',
      to: '2026-06-30T23:59:59.999Z',
      type: 'decision',
    });
  });
});

describe('admin panel artifact transport', () => {
  it('sends level, search, lifecycle, scope, and paging parameters', async () => {
    const paths: string[] = [];
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        return {
          items: [],
          nextCursor: null,
          filteredTotal: 0,
          total: 0,
        };
      },
    };

    await createAdminPanelApi(client).loadArtifacts({
      cursor: '12',
      lifecycleState: 'approved',
      limit: 12,
      requiredLevel: 3,
      scope: 'project',
      search: ' docker ',
    });

    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/admin/artifacts');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cursor: '12',
      lifecycleState: 'approved',
      limit: '12',
      requiredLevel: '3',
      scope: 'project',
      search: 'docker',
    });
  });
});
