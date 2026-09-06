import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import type { RuntimeOverview, RuntimeServiceStatus } from '@trapmap/web-panel/shared/enum-types';
import { useDashboardStore } from '@trapmap/web-panel/stores/dashboard-store';
import { useCallback, useEffect } from 'react';
import { type DashboardGraphStats, type DashboardScale, loadDashboardSnapshot } from './service';

export function useDashboardPageModel(): {
  error: string | null;
  loading: boolean;
  refresh: () => Promise<boolean>;
  services: RuntimeServiceStatus[];
  incidents: string[];
  overview: RuntimeOverview | null;
  trapGraphStats: DashboardGraphStats;
  skillGraphStats: DashboardGraphStats;
  scale: DashboardScale | null;
} {
  const api = getAdminPanelApi();
  const request = useDashboardStore((state) => state.request);
  const setLoading = useDashboardStore((state) => state.setLoading);
  const setOverview = useDashboardStore((state) => state.setOverview);
  const setError = useDashboardStore((state) => state.setError);

  const refresh = useCallback(async () => {
    setLoading();

    try {
      const snapshot = await loadDashboardSnapshot(api);
      setOverview(snapshot);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load runtime overview.');
      return false;
    }
  }, [api, setLoading, setOverview, setError]);

  useEffect(() => {
    if (request.status === 'idle') {
      void refresh();
    }
  }, [request.status, refresh]);

  return {
    loading: request.status === 'loading' || request.status === 'idle',
    error: request.error,
    refresh,
    services: request.payload?.overview.services ?? [],
    incidents: request.payload?.overview.incidents ?? [],
    overview: request.payload?.overview ?? null,
    trapGraphStats: {
      nodes: request.payload?.trapGraph.nodes.length ?? 0,
      edges: request.payload?.trapGraph.edges.length ?? 0,
    },
    skillGraphStats: {
      nodes: request.payload?.skillGraph.nodes.length ?? 0,
      edges: request.payload?.skillGraph.edges.length ?? 0,
    },
    scale: request.payload?.scale ?? null,
  };
}
