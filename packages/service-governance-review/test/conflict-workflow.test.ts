import type { GovernanceConflictEntry, GovernanceConflictReadPort } from '@trapmap/backend-core';
import type { ConflictRelation } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createGovernanceConflictWorkflow } from '../src/conflict-workflow.js';

function entry(id: string, shortcut: string, detail: string): GovernanceConflictEntry {
  return { id, shortcut, detail, lifecycleState: 'approved' };
}

function createProjection() {
  return {
    listByEntryIds: vi.fn<(...entryIds: string[]) => Promise<ConflictRelation[]>>(),
    upsert: vi.fn<(conflict: ConflictRelation) => Promise<void>>(),
  };
}

describe('governance conflict workflow', () => {
  it('persists a canonical contradictory relation for overlapping problems', async () => {
    const read: GovernanceConflictReadPort = {
      getApprovedConflictCandidates: vi.fn().mockResolvedValue({
        entry: entry('entry-new', 'Postgres query timeout', 'avoid table scan'),
        candidates: [entry('entry-old', 'Postgres query timeout', 'use index planner')],
      }),
    };
    const projection = createProjection();
    projection.listByEntryIds.mockResolvedValue([]);

    const workflow = createGovernanceConflictWorkflow({
      read,
      projection,
      createId: () => 'conflict-1',
      now: () => '2026-07-18T00:00:00.000Z',
    });

    await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({
      detectedCount: 1,
    });
    expect(projection.upsert).toHaveBeenCalledWith({
      id: 'conflict-1',
      entryIdA: 'entry-new',
      entryIdB: 'entry-old',
      conflictType: 'contradictory',
      context:
        'Opposing solutions for the same problem: "Postgres query timeout" vs "Postgres query timeout"',
      problemOverlapScore: 1,
      solutionDiffScore: 1,
      detectedAt: '2026-07-18T00:00:00.000Z',
    });
  });

  it('does nothing when the entry is missing or already has no approved candidates', async () => {
    const read: GovernanceConflictReadPort = {
      getApprovedConflictCandidates: vi.fn().mockResolvedValue(null),
    };
    const projection = createProjection();
    const workflow = createGovernanceConflictWorkflow({ read, projection });

    await expect(workflow.detectConflicts({ entryId: 'missing' })).resolves.toEqual({
      detectedCount: 0,
    });
    expect(projection.listByEntryIds).not.toHaveBeenCalled();
    expect(projection.upsert).not.toHaveBeenCalled();
  });

  it('skips an existing canonical relation', async () => {
    const read: GovernanceConflictReadPort = {
      getApprovedConflictCandidates: vi.fn().mockResolvedValue({
        entry: entry('entry-new', 'Postgres query timeout', 'avoid table scan'),
        candidates: [entry('entry-old', 'Postgres query timeout', 'use index planner')],
      }),
    };
    const projection = createProjection();
    projection.listByEntryIds.mockResolvedValue([
      {
        id: 'conflict-existing',
        entryIdA: 'entry-new',
        entryIdB: 'entry-old',
        conflictType: 'contradictory',
        context: 'existing',
        problemOverlapScore: 1,
        solutionDiffScore: 1,
        detectedAt: '2026-07-17T00:00:00.000Z',
      },
    ]);
    const workflow = createGovernanceConflictWorkflow({ read, projection });

    await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({
      detectedCount: 0,
    });
    expect(projection.upsert).not.toHaveBeenCalled();
  });

  it('remains idempotent when the same task is delivered twice', async () => {
    const read: GovernanceConflictReadPort = {
      getApprovedConflictCandidates: vi.fn().mockResolvedValue({
        entry: entry('entry-new', 'Postgres query timeout', 'avoid table scan'),
        candidates: [entry('entry-old', 'Postgres query timeout', 'use index planner')],
      }),
    };
    const projection = createProjection();
    projection.listByEntryIds.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'conflict-1',
        entryIdA: 'entry-new',
        entryIdB: 'entry-old',
        conflictType: 'contradictory',
        context: 'existing',
        problemOverlapScore: 1,
        solutionDiffScore: 1,
        detectedAt: '2026-07-18T00:00:00.000Z',
      },
    ]);
    const workflow = createGovernanceConflictWorkflow({
      read,
      projection,
      createId: () => 'conflict-1',
      now: () => '2026-07-18T00:00:00.000Z',
    });

    await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({
      detectedCount: 1,
    });
    await expect(workflow.detectConflicts({ entryId: 'entry-new' })).resolves.toEqual({
      detectedCount: 0,
    });
    expect(projection.upsert).toHaveBeenCalledTimes(1);
  });
});
