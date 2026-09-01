import { describe, expect, it } from 'vitest';

import type { ReviewQueueResponse } from '@trapmap/contracts';
import { createAdminPanelApi } from '../../../src/services/api/admin-panel-api';
import type { HttpClient } from '../../../src/services/api/http-client';

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
    expect(url.pathname).toBe('/api/admin/reviews');
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

  it('serializes review-queue query through T2 Zod (trims, coerces limit, validates cursor)', async () => {
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

    // Verify that the transport trims and preserves the T2 schema vocabulary
    await createAdminPanelApi(client).loadPendingReviews({
      filters: {
        search: '  docker  ',
        status: 'all',
        source: 'all',
        riskLevel: 'all',
        sort: 'highest-risk',
      },
      paging: { cursor: '0', limit: 20 },
    });
    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/admin/reviews');
    expect(url.searchParams.get('search')).toBe('docker');
    expect(url.searchParams.get('limit')).toBe('20');
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

describe('admin panel review decision transport', () => {
  it('posts to /api/admin/reviews/:id/decision with decision and notes', async () => {
    const paths: string[] = [];
    const bodies: unknown[] = [];
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        bodies.push(options.body);
        return { entry: { id: 'rev-1', lifecycleState: 'approved' } } as never;
      },
    };

    await createAdminPanelApi(client).submitReviewDecision({
      entryId: 'rev-1',
      decision: 'approve',
      notes: 'looks good',
    } as never);

    expect(paths[0]).toBe('/api/admin/reviews/rev-1/decision');
    expect(bodies[0]).toMatchObject({ decision: 'approve', notes: 'looks good' });
  });
});

describe('admin panel graph transport', () => {
  it('sends trap graph query to /api/admin/graph/traps with canonical params', async () => {
    const paths: string[] = [];
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        return { nodes: [], edges: [] } as never;
      },
    };

    await createAdminPanelApi(client).loadTrapGraph({ depth: '2' } as never);
    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/admin/graph/traps');
    expect(url.searchParams.get('depth')).toBe('2');
  });

  it('sends skill graph query to /api/admin/graph/skills with artifactId and mode', async () => {
    const paths: string[] = [];
    const client: HttpClient = {
      async request(options) {
        paths.push(options.path);
        return { nodes: [], edges: [] } as never;
      },
    };

    await createAdminPanelApi(client).loadSkillGraph('art-101', { mode: 'semantic' } as never);
    const url = new URL(paths[0] ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/admin/graph/skills');
    expect(url.searchParams.get('artifactId')).toBe('art-101');
    expect(url.searchParams.get('mode')).toBe('semantic');
  });
});
