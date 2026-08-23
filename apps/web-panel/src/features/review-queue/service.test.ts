import { describe, expect, it } from 'vitest';

import { createMockAdminPanelApi } from '@trapmap/web-panel/services/api/mock-admin-panel-api';

import { loadPendingReviews } from './service';

describe('loadPendingReviews', () => {
  it('keeps the backend total while reporting the filtered page size', async () => {
    const api = createMockAdminPanelApi();
    const page = await loadPendingReviews(api, {
      filters: {
        status: 'all',
        sort: 'highest-risk',
        source: 'all',
        search: 'query-that-has-no-match',
        riskLevel: 'all',
      },
      paging: { limit: 25 },
    });

    expect(page.items).toHaveLength(0);
    expect(page.filteredTotal).toBe(0);
    expect(page.total).toBe(3);
    expect(page.nextCursor).toBeNull();
  });
});
