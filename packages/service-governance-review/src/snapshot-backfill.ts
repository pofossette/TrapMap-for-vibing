import { isDeepStrictEqual } from 'node:util';

import type { FeedbackQueueRecord } from '@trapmap/backend-core';
import type { ConflictRelation } from '@trapmap/contracts';

export interface GovernanceSnapshotOwner {
  feedbackRepo: {
    insert(record: FeedbackQueueRecord): Promise<void>;
    getById(recordId: string): Promise<FeedbackQueueRecord | null>;
  };
  conflictProjection: {
    upsert(record: ConflictRelation): Promise<void>;
    getById(recordId: string): Promise<ConflictRelation | null>;
  };
}

export interface GovernanceSnapshotBackfillResult {
  migrated: number;
  skipped: number;
  errors: Array<{ domain: 'feedbackQueue' | 'conflicts'; recordId: string; error: string }>;
  verified: number;
}

async function migrateRecords<T extends { id: string }>(
  domain: 'feedbackQueue' | 'conflicts',
  records: readonly T[],
  read: (id: string) => Promise<T | null>,
  write: (record: T) => Promise<void>,
  result: GovernanceSnapshotBackfillResult,
): Promise<void> {
  for (const record of records) {
    try {
      const existing = await read(record.id);
      if (existing) {
        if (recordsMatch(existing, record)) {
          result.skipped += 1;
          result.verified += 1;
        } else {
          result.errors.push({
            domain,
            recordId: record.id,
            error: 'destination record differs from snapshot',
          });
        }
        continue;
      } else {
        await write(record);
        result.migrated += 1;
      }
      const written = await read(record.id);
      if (written && recordsMatch(written, record)) result.verified += 1;
      else {
        result.errors.push({
          domain,
          recordId: record.id,
          error: 'destination record differs from snapshot after write',
        });
      }
    } catch (error) {
      result.errors.push({
        domain,
        recordId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function recordsMatch<T>(left: T, right: T): boolean {
  return isDeepStrictEqual(left, right);
}

export async function migrateGovernanceSnapshot(input: {
  owner: GovernanceSnapshotOwner;
  snapshot: {
    feedbackQueue: readonly FeedbackQueueRecord[];
    conflicts: readonly ConflictRelation[];
  };
}): Promise<GovernanceSnapshotBackfillResult> {
  const result: GovernanceSnapshotBackfillResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    verified: 0,
  };
  await migrateRecords(
    'feedbackQueue',
    input.snapshot.feedbackQueue,
    (id) => input.owner.feedbackRepo.getById(id),
    (record) => input.owner.feedbackRepo.insert(record),
    result,
  );
  await migrateRecords(
    'conflicts',
    input.snapshot.conflicts,
    (id) => input.owner.conflictProjection.getById(id),
    (record) => input.owner.conflictProjection.upsert(record),
    result,
  );
  return result;
}
