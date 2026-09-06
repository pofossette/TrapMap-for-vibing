import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { ActivityFeedFilters, ActivityFeedPage } from '@trapmap/web-panel/shared/enum-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadActivityFeed } from './service';

const initialFilters: ActivityFeedFilters = {
  actor: '',
  from: '',
  search: '',
  to: '',
  type: 'all',
};

function buildQuery(filters: ActivityFeedFilters, cursor: string | null) {
  return {
    ...(filters.actor.trim() ? { actor: filters.actor } : {}),
    ...(cursor ? { cursor } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    limit: 20,
    ...(filters.search.trim() ? { search: filters.search } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
    ...(filters.type === 'all' ? {} : { type: filters.type }),
  };
}

export function useActivityPageModel() {
  const api = getAdminPanelApi();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActivityFeedFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<ActivityFeedPage>({
    events: [],
    filteredTotal: 0,
    nextCursor: null,
    total: 0,
  });

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const next = await loadActivityFeed(api, buildQuery(filters, cursor));
      setPage(next);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load activity feed.');
    } finally {
      setLoading(false);
    }
  }, [api, cursor, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateFilters = useCallback((patch: Partial<ActivityFeedFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setCursor(null);
  }, []);

  const updateCursor = useCallback((nextCursor: string | null) => {
    setCursor(nextCursor);
  }, []);

  return useMemo(
    () => ({
      cursor,
      error,
      filters,
      loading,
      page,
      refresh,
      updateCursor,
      updateFilters,
    }),
    [cursor, error, filters, loading, page, refresh, updateCursor, updateFilters],
  );
}
