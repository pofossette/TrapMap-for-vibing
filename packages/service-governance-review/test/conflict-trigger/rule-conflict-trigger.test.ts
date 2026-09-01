import { describe, expect, it } from 'vitest';

import type { GovernanceConflictEntry } from '@trapmap/backend-core';
import {
  assertConflictResultShape,
  conflictSampleInput,
  createStubConflictRead,
} from '@trapmap/backend-core';
import type { ConflictRelation } from '@trapmap/contracts';

import { createRuleConflictTrigger } from '../../src/conflict-trigger/rule-conflict-trigger.js';

function entry(id: string, shortcut: string, detail: string): GovernanceConflictEntry {
  return { id, shortcut, detail, lifecycleState: 'approved' };
}

function createProjection() {
  return {
    listByEntryIds: async (): Promise<ConflictRelation[]> => [],
    upsert: async (): Promise<void> => {},
  };
}

describe('rule conflict trigger', () => {
  it('reports no conflict when there are no approved candidates', async () => {
    const trigger = createRuleConflictTrigger({
      read: createStubConflictRead(null),
      projection: createProjection(),
    });

    const result = await trigger.detectConflicts(conflictSampleInput);

    assertConflictResultShape(result);
    expect(result.detectedCount).toBe(0);
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no conflict detected');
  });

  it('triggers when a candidate shares overlapping problems', async () => {
    const trigger = createRuleConflictTrigger({
      read: createStubConflictRead({
        entry: entry(
          'entry-conflict-1',
          'Reset admin password',
          'stop the service then rotate the secret and restart the daemon',
        ),
        candidates: [entry('entry-conflict-2', 'Reset admin password', '完全相同 detail')],
      }),
      projection: createProjection(),
    });

    const result = await trigger.detectConflicts({ entryId: 'entry-conflict-1' });

    assertConflictResultShape(result);
    expect(result.triggered).toBe(true);
    expect(result.detectedCount).toBeGreaterThanOrEqual(1);
  });
});
