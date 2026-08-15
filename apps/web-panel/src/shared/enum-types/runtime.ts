export type RuntimeServiceHealth = 'healthy' | 'degraded' | 'failed';

export type RuntimeServiceStatus = {
  detail: string;
  lastCheckedAt: string;
  name: string;
  status: RuntimeServiceHealth;
  version: string;
};

export type RuntimeQueueMetric = {
  label: string;
  value: number;
};

export type RuntimeOverview = {
  buildId: string;
  deploymentProfile: string;
  failedJobsCount: number;
  incidents: string[];
  lastHealthCheckAt: string;
  pendingReviewCount: number;
  throughputPerHour: number;
  services: RuntimeServiceStatus[];
  workload: RuntimeQueueMetric[];
};

export type RuntimeOverviewResponse = {
  buildId: string;
  deploymentProfile: string;
  failedJobsCount: number;
  incidents: string[];
  lastHealthCheckAt: string;
  pendingReviewCount: number;
  services: RuntimeServiceStatus[];
  throughputPerHour: number;
  workload: RuntimeQueueMetric[];
};
