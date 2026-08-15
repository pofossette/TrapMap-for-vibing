import { routeResponse } from './route-contract.js';

export interface ServiceReadinessOptions {
  checkDependency?: (() => Promise<{ reachable: boolean; detail?: string }>) | undefined;
  checks: Record<string, { detail: string | null; status: string }>;
  extra: Record<string, unknown>;
  service: string;
}

export function createServiceReadinessHandler(options: ServiceReadinessOptions) {
  return async () => {
    let dependencyStatus: { reachable: boolean; detail?: string } = { reachable: true };
    if (options.checkDependency) {
      try {
        dependencyStatus = await options.checkDependency();
      } catch {
        dependencyStatus = { reachable: false, detail: 'dependency check threw' };
      }
    }
    const ready = dependencyStatus.reachable;
    const checks = Object.fromEntries(
      Object.entries(options.checks).map(([name, check]) => [
        name,
        {
          status: ready ? check.status : 'degraded',
          detail: ready ? check.detail : (dependencyStatus.detail ?? null),
        },
      ]),
    );
    const body = {
      ready,
      service: options.service,
      checks: {
        self: { status: 'ok' },
        ...checks,
      },
      ...options.extra,
    };
    return ready ? body : routeResponse(503, body);
  };
}
