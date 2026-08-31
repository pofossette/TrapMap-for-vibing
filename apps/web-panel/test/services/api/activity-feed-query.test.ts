import { describe, expect, it } from 'vitest';

import type { ActivityEventViewModel } from '@trapmap/web-panel/shared/enum-types';
import { applyActivityFeedQuery } from '../../../src/services/api/activity-feed-query';

function createEvent(overrides: Partial<ActivityEventViewModel>): ActivityEventViewModel {
  return {
    id: 'event',
    actor: 'reviewer@trapmap.local',
    description: 'Review queue handoff completed.',
    relatedReviewId: null,
    timestamp: '2026-06-19T10:00:00.000Z',
    title: 'Review approved',
    tone: 'success',
    typeLabel: 'decision',
    ...overrides,
  };
}

describe('activity feed query seam', () => {
  const events = [
    createEvent({
      id: 'decision-new',
      actor: 'reviewer@trapmap.local',
      timestamp: '2026-06-20T10:00:00.000Z',
      title: 'New review handoff',
      typeLabel: 'Decision',
    }),
    createEvent({
      id: 'intervention',
      actor: 'operator@trapmap.local',
      description: 'Payload edited during recovery.',
      timestamp: '2026-06-19T10:00:00.000Z',
      title: 'Payload edited',
      tone: 'warning',
      typeLabel: 'Intervention',
    }),
    createEvent({
      id: 'decision-old',
      timestamp: '2026-06-18T10:00:00.000Z',
      title: 'Old review handoff',
    }),
  ];

  it('filters by actor, type, search, and time before sorting newest first', () => {
    const result = applyActivityFeedQuery(events, {
      actor: 'reviewer',
      from: '2026-06-19T00:00:00.000Z',
      limit: 10,
      search: 'handoff',
      to: '2026-06-20T23:59:59.999Z',
      type: 'decision',
    });

    expect(result.events.map((event) => event.id)).toEqual(['decision-new']);
    expect(result.filteredTotal).toBe(1);
    expect(result.total).toBe(3);
  });

  it('emits an opaque offset cursor while paging the filtered result', () => {
    const first = applyActivityFeedQuery(events, { limit: 2 });
    expect(first.events.map((event) => event.id)).toEqual(['decision-new', 'intervention']);
    expect(first.filteredTotal).toBe(3);
    expect(first.nextCursor).toBe('2');

    const second = applyActivityFeedQuery(events, { cursor: '2', limit: 2 });
    expect(second.events.map((event) => event.id)).toEqual(['decision-old']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects malformed cursors instead of restarting at the first page', () => {
    expect(() => applyActivityFeedQuery(events, { cursor: 'not-a-cursor', limit: 10 })).toThrow(
      'Invalid activity feed cursor',
    );
  });
});
