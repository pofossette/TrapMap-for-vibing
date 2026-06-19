import { useCallback, useEffect, useMemo } from 'react';

import { getAdminPanelApi } from '../../services/admin-panel-service-context';
import { useDashboardStore } from '../../stores/dashboard-store';
import { loadRuntimeOverview } from './service';

type DashboardCardTone = 'success' | 'warning' | 'danger';

type DashboardCard = {
  badge: string;
  helpText: string;
  label: string;
  tone: DashboardCardTone;
  value: string;
};

import type { RuntimeOverview, RuntimeServiceStatus } from '../../shared/types/admin-panel';

export function useDashboardPageModel(): {
  cards: DashboardCard[];
  error: string | null;
  loading: boolean;
  refresh: () => Promise<boolean>;
  services: RuntimeServiceStatus[];
  incidents: string[];
  overview: RuntimeOverview | null;
} {
  const api = getAdminPanelApi();
  const request = useDashboardStore((state) => state.request);
  const setLoading = useDashboardStore((state) => state.setLoading);
  const setOverview = useDashboardStore((state) => state.setOverview);
  const setError = useDashboardStore((state) => state.setError);

  const refresh = useCallback(async () => {
    setLoading();

    try {
      const overview = await loadRuntimeOverview(api);
      setOverview(overview);
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

  const cards: DashboardCard[] = useMemo(() => {
    const overview = request.payload;

    if (!overview) {
      return [];
    }

    const healthyServices = overview.services.filter(
      (service) => service.status === 'healthy',
    ).length;
    const degradedServices = overview.services.filter(
      (service) => service.status !== 'healthy',
    ).length;

    return [
      {
        label: 'Service Health',
        value: `${healthyServices} / ${overview.services.length}`,
        badge: degradedServices === 0 ? 'Healthy' : 'Watch',
        tone: degradedServices === 0 ? 'success' : 'warning',
        helpText: `Last health check ${overview.lastHealthCheckAt}.`,
      },
      {
        label: 'Pending Reviews',
        value: String(overview.pendingReviewCount),
        badge: overview.pendingReviewCount > 0 ? 'Attention' : 'Clear',
        tone: overview.pendingReviewCount > 0 ? 'warning' : 'success',
        helpText: `${overview.workload.find((metric) => metric.label === 'Candidate Backlog')?.value ?? 0} items in candidate backlog.`,
      },
      {
        label: 'Failed Jobs',
        value: String(overview.failedJobsCount),
        badge: overview.failedJobsCount > 0 ? 'Watch' : 'Stable',
        tone: overview.failedJobsCount > 0 ? 'danger' : 'success',
        helpText: overview.incidents[0] ?? 'No active incidents.',
      },
      {
        label: 'Throughput',
        value: `${overview.throughputPerHour}/hr`,
        badge: overview.deploymentProfile,
        tone: 'success',
        helpText: `Build ${overview.buildId}.`,
      },
    ];
  }, [request.payload]);

  return {
    cards,
    loading: request.status === 'loading' || request.status === 'idle',
    error: request.error,
    refresh,
    services: request.payload?.services ?? [],
    incidents: request.payload?.incidents ?? [],
    overview: request.payload,
  };
}
