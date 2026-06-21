import type { ReviewItemViewModel, ReviewQueueFilters } from '@trapmap/web-panel/shared/enum-types';
import { useEffect, useMemo } from 'react';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { useReviewQueueStore } from '@trapmap/web-panel/stores/review-queue-store';
import { loadPendingReviews } from './service';

export function useReviewQueuePageModel(): {
  error: string | null;
  filters: ReviewQueueFilters;
  items: ReviewItemViewModel[];
  loading: boolean;
  refresh: () => Promise<void>;
  total: number;
  updateFilters: ReturnType<typeof useReviewQueueStore.getState>['updateFilters'];
} {
  const api = getAdminPanelApi();
  const filters = useReviewQueueStore((state) => state.filters);
  const request = useReviewQueueStore((state) => state.request);
  const updateFilters = useReviewQueueStore((state) => state.updateFilters);
  const setLoading = useReviewQueueStore((state) => state.setLoading);
  const setItems = useReviewQueueStore((state) => state.setItems);
  const setError = useReviewQueueStore((state) => state.setError);

  async function refresh() {
    setLoading();

    try {
      const page = await loadPendingReviews(api, {
        filters,
        paging: {
          limit: 25,
        },
      });
      setItems(page);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load review queue.');
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run refresh on filter changes
  useEffect(() => {
    void refresh();
  }, [filters.riskLevel, filters.search, filters.sort, filters.source, filters.status]);

  const payload = useMemo(
    () =>
      request.payload ?? {
        items: [],
        total: 0,
      },
    [request.payload],
  );

  return {
    filters,
    items: payload.items,
    total: payload.total,
    loading: request.status === 'loading' || request.status === 'idle',
    error: request.error,
    refresh,
    updateFilters,
  };
}
