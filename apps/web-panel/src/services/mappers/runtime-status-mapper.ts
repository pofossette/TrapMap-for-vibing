import type {
  RuntimeOverview,
  RuntimeOverviewResponse,
  RuntimeServiceHealth,
  RuntimeServiceStatus,
} from '@trapmap/web-panel/shared/enum-types';

function normalizeServiceStatus(status: RuntimeServiceHealth): RuntimeServiceHealth {
  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'degraded') {
    return 'degraded';
  }

  return 'healthy';
}

function mapService(service: RuntimeServiceStatus): RuntimeServiceStatus {
  return {
    ...service,
    status: normalizeServiceStatus(service.status),
  };
}

export function mapRuntimeOverview(response: RuntimeOverviewResponse): RuntimeOverview {
  return {
    ...response,
    services: response.services.map(mapService),
    incidents: [...response.incidents],
    workload: response.workload.map((metric) => ({ ...metric })),
  };
}
