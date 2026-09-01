import { describe, expect, it } from 'vitest';

import { createMockAdminPanelApi } from '@trapmap/web-panel/services/api/mock-admin-panel-api';
import {
  mapReviewDetail,
  mapReviewQueueItem,
} from '../../../src/services/mappers/review-item-mapper';

describe('review-item-mapper', () => {
  it('returns stable risk keys instead of English review labels', async () => {
    const api = createMockAdminPanelApi();
    const queue = await api.loadPendingReviews();
    const mapped = mapReviewQueueItem(queue.items[0]);

    expect(mapped.riskLabel).toBe('high');
  });

  it('returns stable metadata keys and warning kinds for review detail', async () => {
    const api = createMockAdminPanelApi();
    const detail = await api.loadReviewDetail('rev-201');
    detail.entry.reviewNotes.push({
      id: 'note-localization',
      message: 'manual follow-up required',
      createdAt: detail.entry.updatedAt,
      authorType: 'reviewer',
      author: detail.entry.owner,
    });
    const mapped = mapReviewDetail(detail.entry);

    expect(mapped.metadata.map((item) => item.label)).toEqual([
      'scope',
      'required-level',
      'owner',
      'last-updated',
    ]);
    expect(mapped.warnings.map((warning) => warning.kind)).toEqual(
      expect.arrayContaining(['agent-note', 'manual-flag']),
    );
  });
});
