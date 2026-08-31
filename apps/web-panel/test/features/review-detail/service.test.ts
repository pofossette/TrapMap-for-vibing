import { describe, expect, it } from 'vitest';

import { createMockAdminPanelApi } from '@trapmap/web-panel/services/api/mock-admin-panel-api';
import {
  loadReviewDetail,
  submitReviewDecision,
} from '../../../src/features/review-detail/service';

describe('review-detail service', () => {
  it('maps detail response into stable view model', async () => {
    const detail = await loadReviewDetail(createMockAdminPanelApi(), 'rev-201');

    expect(detail.id).toBe('rev-201');
    expect(detail.title).toBe('Runtime candidate with schema drift');
    expect(detail.warnings.length).toBeGreaterThan(0);
    expect(detail.jsonPayload).toContain('"id": "rev-201"');
  });

  it('maps review decision response back into detail view model', async () => {
    const updated = await submitReviewDecision(createMockAdminPanelApi(), {
      entryId: 'rev-201',
      decision: 'approve',
      notes: 'looks good',
    });

    expect(updated.status).toBe('approved');
    expect(updated.reviewHistory.at(-1)?.notes).toBe('looks good');
  });

  it('keeps return-for-correction out of the rejected lifecycle', async () => {
    const updated = await submitReviewDecision(createMockAdminPanelApi(), {
      entryId: 'rev-201',
      decision: 'return-for-correction',
      notes: 'revise the boundary fields',
    });

    expect(updated.status).toBe('submitted');
    expect(updated.rawEntry.lifecycleState).toBe('submitted');
    expect(updated.reviewHistory.at(-1)?.decision).toBe('return-for-correction');
    expect(updated.reviewHistory.at(-1)?.notes).toBe('revise the boundary fields');
  });
});
