export interface GovernanceSnapshotOwner {
  feedbackRepo: {
    insert(record: { id: string }): Promise<void>;
    getById(recordId: string): Promise<{ id: string } | null>;
  };
  conflictProjection: {
    upsert(record: { id: string }): Promise<void>;
    getById(recordId: string): Promise<{ id: string } | null>;
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
  read: (id: string) => Promise<{ id: string } | null>,
  write: (record: T) => Promise<void>,
  result: GovernanceSnapshotBackfillResult,
): Promise<void> {
  for (const record of records) {
    try {
      if (await read(record.id)) result.skipped += 1;
      else {
        await write(record);
        result.migrated += 1;
      }
      if (await read(record.id)) result.verified += 1;
    } catch (error) {
      result.errors.push({
        domain,
        recordId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function migrateGovernanceSnapshot(input: {
  owner: GovernanceSnapshotOwner;
  snapshot: { feedbackQueue: readonly { id: string }[]; conflicts: readonly { id: string }[] };
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
