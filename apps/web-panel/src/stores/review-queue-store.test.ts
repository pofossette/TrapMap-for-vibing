import { beforeEach, describe, expect, it } from 'vitest';

import { useReviewQueueStore } from './review-queue-store';

describe('review-queue-store', () => {
  beforeEach(() => {
    useReviewQueueStore.setState({
      filters: {
        status: 'all',
        sort: 'highest-risk',
        source: 'all',
        search: '',
        riskLevel: 'all',
      },
      request: {
        status: 'idle',
        payload: { items: [], filteredTotal: 0, nextCursor: null, total: 0 },
        error: null,
        lastUpdatedAt: null,
      },
      paging: { cursor: null, limit: 25 },
    });
  });

  it('initializes with empty request payload', () => {
    const state = useReviewQueueStore.getState();

    expect(state.filters.sort).toBe('highest-risk');
    expect(state.paging).toEqual({ cursor: null, limit: 25 });
    expect(state.request.status).toBe('idle');
    expect(state.request.payload).toEqual({
      items: [],
      filteredTotal: 0,
      nextCursor: null,
      total: 0,
    });
  });

  it('tracks request lifecycle and filter updates', () => {
    const store = useReviewQueueStore.getState();

    store.updateFilters({ search: 'schema', riskLevel: 'high' });
    store.setLoading();
    store.setItems({
      items: [
        {
          id: 'rev-1',
          title: 'Schema drift',
          subtitle: 'manual review required',
          source: 'candidate-ingestion',
          status: 'submitted',
          createdAt: '2026-06-19T10:20:00.000Z',
          assignedReviewer: null,
          riskScore: 8,
          riskLabel: 'high',
          riskTone: 'danger',
        },
      ],
      filteredTotal: 1,
      nextCursor: null,
      total: 1,
    });

    const next = useReviewQueueStore.getState();

    expect(next.filters.search).toBe('schema');
    expect(next.filters.riskLevel).toBe('high');
    expect(next.request.status).toBe('success');
    expect(next.request.payload?.items).toHaveLength(1);
  });

  it('resets pagination when filters change and tracks explicit paging', () => {
    const store = useReviewQueueStore.getState();

    store.setPaging({ cursor: '25', limit: 25 });
    store.updateFilters({ search: 'schema' });

    const afterFilter = useReviewQueueStore.getState();
    expect(afterFilter.paging.cursor).toBeNull();

    afterFilter.updatePaging({ cursor: '50' });
    expect(useReviewQueueStore.getState().paging).toEqual({ cursor: '50', limit: 25 });
  });
});
