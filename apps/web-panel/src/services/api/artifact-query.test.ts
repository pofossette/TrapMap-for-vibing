import { describe, expect, it } from 'vitest';

import { applyArtifactQuery } from './artifact-query';
import { createMockAdminPanelApi } from './mock-admin-panel-api';

describe('mock artifact query seam', () => {
  it('applies lifecycle, scope, level, and search together', async () => {
    const api = createMockAdminPanelApi();
    const result = await api.loadArtifacts({
      lifecycleState: 'approved',
      scope: 'project',
      requiredLevel: 3,
      search: 'docker',
    });

    expect(result.items.map((artifact) => artifact.id)).toEqual(['art-101']);
    expect(result.filteredTotal).toBe(1);
    expect(result.total).toBe(2);
  });

  it('sorts deterministically and pages the filtered result', async () => {
    const api = createMockAdminPanelApi();
    const first = await api.loadArtifacts({ limit: 1 });

    expect(first.items.map((artifact) => artifact.id)).toEqual(['art-102']);
    expect(first.filteredTotal).toBe(2);
    expect(first.nextCursor).toBe('1');

    const second = await api.loadArtifacts({ cursor: '1', limit: 1 });
    expect(second.items.map((artifact) => artifact.id)).toEqual(['art-101']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects malformed cursors instead of returning the first page', () => {
    expect(() => applyArtifactQuery([], { cursor: 'not-a-cursor' })).toThrow(
      'Invalid artifact cursor',
    );
  });
});
