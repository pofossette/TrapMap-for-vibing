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
        payload: { items: [], total: 0 },
        error: null,
        lastUpdatedAt: null,
      },
    });
  });

  it('initializes with empty request payload', () => {
    const state = useReviewQueueStore.getState();

    expect(state.filters.sort).toBe('highest-risk');
    expect(state.request.status).toBe('idle');
    expect(state.request.payload).toEqual({ items: [], total: 0 });
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
      total: 1,
    });

    const next = useReviewQueueStore.getState();

    expect(next.filters.search).toBe('schema');
    expect(next.filters.riskLevel).toBe('high');
    expect(next.request.status).toBe('success');
    expect(next.request.payload?.items).toHaveLength(1);
  });
});
