import { describe, expect, it } from 'vitest';

import { enrichConflictHints } from './conflict-projection.js';

describe('conflict read projection', () => {
  it('returns only hints visible to the retrieval actor', () => {
    const hints = enrichConflictHints(
      [{ entryId: 'entry-a' }],
      [{ id: 'conflict-1', entryIdA: 'entry-a', entryIdB: 'entry-b', conflictType: 'alternative', context: 'Different approaches', problemOverlapScore: 0.8, solutionDiffScore: 0.5, detectedAt: '2026-07-18T00:00:00.000Z' }],
      [{ id: 'entry-a', shortcut: 'Public option', teamId: null, requiredLevel: 0 }, { id: 'entry-b', shortcut: 'Restricted option', teamId: 'team-b', requiredLevel: 7 }],
      { teamId: 'team-a', requiredLevel: 5 },
    );

    expect(hints.size).toBe(0);
  });

  it('returns the related entry hint when the retrieval actor can view it', () => {
    const hints = enrichConflictHints(
      [{ entryId: 'entry-a' }],
      [{ id: 'conflict-1', entryIdA: 'entry-a', entryIdB: 'entry-b', conflictType: 'contradictory', context: 'Opposite instructions', problemOverlapScore: 0.9, solutionDiffScore: 0.9, detectedAt: '2026-07-18T00:00:00.000Z' }],
      [{ id: 'entry-a', shortcut: 'First option', teamId: null, requiredLevel: 0 }, { id: 'entry-b', shortcut: 'Second option', teamId: null, requiredLevel: 5 }],
      { teamId: 'team-a', requiredLevel: 5 },
    );

    expect(hints.get('entry-a')).toEqual([{ entryId: 'entry-b', shortcut: 'Second option', conflictType: 'contradictory', context: 'Opposite instructions' }]);
  });
});
