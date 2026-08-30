import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAdminPanelApi } from '@trapmap/web-panel/services/api/mock-admin-panel-api';

import { loadDashboardSnapshot } from './service';

describe('loadDashboardSnapshot', () => {
  it('aggregates runtime, graph, and artifact scale into one snapshot', async () => {
    const snapshot = await loadDashboardSnapshot(createMockAdminPanelApi());

    expect(snapshot.overview.pendingReviewCount).toBe(18);
    expect(snapshot.overview.failedJobsCount).toBe(2);
    expect(snapshot.trapGraph.nodes).toHaveLength(9);
    expect(snapshot.trapGraph.edges).toHaveLength(8);
    expect(snapshot.skillGraph.nodes).toHaveLength(7);
    expect(snapshot.skillGraph.edges).toHaveLength(7);
    expect(snapshot.scale).toEqual({
      traps: 2,
      skillArtifacts: 2,
      capsules: 2,
    });
  });

  it('prefers a derived artifact for the preview graph while paging artifacts', async () => {
    // Real mode uses bounded page (20) via new pagination shape
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'real');
    vi.resetModules();
    const { loadDashboardSnapshot: loadReal } = await import('./service.js');
    const { createMockAdminPanelApi: createMock } = await import(
      '@trapmap/web-panel/services/api/mock-admin-panel-api.js'
    );
    const derivedReal = createMock();
    const requestsReal: unknown[] = [];
    const apiReal = {
      ...derivedReal,
      loadArtifacts(query: unknown) {
        requestsReal.push(query);
        return derivedReal.loadArtifacts(query as never);
      },
    } as unknown as Parameters<typeof loadReal>[0];
    const snapshotReal = await loadReal(apiReal);
    expect(requestsReal).toEqual([{ limit: 20 }]);
    expect(snapshotReal.skillGraph.nodes).toHaveLength(7);

    // Mock mode keeps 100 snapshot for deterministic fixture
    vi.stubEnv('VITE_ADMIN_PANEL_API_MODE', 'mock');
    vi.stubEnv('MODE', 'test');
    vi.resetModules();
    const { loadDashboardSnapshot: loadMock } = await import('./service.js');
    const { createMockAdminPanelApi: createMock2 } = await import(
      '@trapmap/web-panel/services/api/mock-admin-panel-api.js'
    );
    const derivedMock = createMock2();
    const requestsMock: unknown[] = [];
    const apiMock = {
      ...derivedMock,
      loadArtifacts(query: unknown) {
        requestsMock.push(query);
        return derivedMock.loadArtifacts(query as never);
      },
    } as unknown as Parameters<typeof loadMock>[0];
    const snapshotMock = await loadMock(apiMock);
    expect(requestsMock).toEqual([{ limit: 100 }]);
    expect(snapshotMock.skillGraph.nodes).toHaveLength(7);
    vi.unstubAllEnvs();
  });
});
