import { describe, expect, it } from 'vitest';

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
});
