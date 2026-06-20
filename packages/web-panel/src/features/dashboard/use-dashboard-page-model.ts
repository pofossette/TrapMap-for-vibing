import { useCallback, useEffect, useMemo } from 'react';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { useDashboardStore } from '@trapmap/web-panel/stores/dashboard-store';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import { loadRuntimeOverview } from './service';

type DashboardCardTone = 'success' | 'warning' | 'danger';

type DashboardCard = {
  badge: string;
  helpText: string;
  label: string;
  tone: DashboardCardTone;
  value: string;
};

import type {
  RuntimeOverview,
  RuntimeServiceStatus,
} from '@trapmap/web-panel/shared/types/admin-panel';

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
  const { t, language } = useI18nStore();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: t uses language state internally
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
        label: t('serviceHealthLabel'),
        value: `${healthyServices} / ${overview.services.length}`,
        badge: degradedServices === 0 ? t('badgeHealthy') : t('badgeWatch'),
        tone: degradedServices === 0 ? 'success' : 'warning',
        helpText: `${t('lastHealthCheck')} ${overview.lastHealthCheckAt}.`,
      },
      {
        label: t('pendingReviewsLabel'),
        value: String(overview.pendingReviewCount),
        badge: overview.pendingReviewCount > 0 ? t('badgeAttention') : t('badgeClear'),
        tone: overview.pendingReviewCount > 0 ? 'warning' : 'success',
        helpText: `${overview.workload.find((metric) => metric.label === 'Candidate Backlog')?.value ?? 0} ${t('backlogItems')}.`,
      },
      {
        label: t('failedJobsLabel'),
        value: String(overview.failedJobsCount),
        badge: overview.failedJobsCount > 0 ? t('badgeWatch') : t('badgeStable'),
        tone: overview.failedJobsCount > 0 ? 'danger' : 'success',
        helpText: overview.incidents[0] ?? `${t('noIncidents')}.`,
      },
      {
        label: t('throughputLabel'),
        value: `${overview.throughputPerHour}/hr`,
        badge: overview.deploymentProfile,
        tone: 'success',
        helpText: `${t('buildLabel')} ${overview.buildId}.`,
      },
    ];
  }, [request.payload, t, language]);

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
