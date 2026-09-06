import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { ReviewItemViewModel, ReviewQueueFilters } from '@trapmap/web-panel/shared/enum-types';
import { useReviewQueueStore } from '@trapmap/web-panel/stores/review-queue-store';
import { useEffect, useMemo } from 'react';
import { loadPendingReviews } from './service';

export function useReviewQueuePageModel(): {
  error: string | null;
  filters: ReviewQueueFilters;
  items: ReviewItemViewModel[];
  filteredTotal: number;
  loading: boolean;
  nextCursor: string | null;
  paging: { cursor: string | null; limit: number };
  refresh: () => Promise<void>;
  total: number;
  updateFilters: ReturnType<typeof useReviewQueueStore.getState>['updateFilters'];
  updatePaging: ReturnType<typeof useReviewQueueStore.getState>['updatePaging'];
} {
  const api = getAdminPanelApi();
  const filters = useReviewQueueStore((state) => state.filters);
  const paging = useReviewQueueStore((state) => state.paging);
  const request = useReviewQueueStore((state) => state.request);
  const updateFilters = useReviewQueueStore((state) => state.updateFilters);
  const updatePaging = useReviewQueueStore((state) => state.updatePaging);
  const setLoading = useReviewQueueStore((state) => state.setLoading);
  const setItems = useReviewQueueStore((state) => state.setItems);
  const setError = useReviewQueueStore((state) => state.setError);

  async function refresh() {
    setLoading();

    try {
      const page = await loadPendingReviews(api, {
        filters,
        paging: {
          ...paging,
          cursor: paging.cursor ?? undefined,
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
  }, [
    filters.riskLevel,
    filters.search,
    filters.sort,
    filters.source,
    filters.status,
    paging.cursor,
    paging.limit,
  ]);

  const payload = useMemo(
    () => request.payload ?? { items: [], filteredTotal: 0, nextCursor: null, total: 0 },
    [request.payload],
  );

  return {
    filters,
    items: payload.items,
    filteredTotal: payload.filteredTotal,
    nextCursor: payload.nextCursor,
    paging,
    total: payload.total,
    loading: request.status === 'loading' || request.status === 'idle',
    error: request.error,
    refresh,
    updateFilters,
    updatePaging,
  };
}
