import { isDeepStrictEqual } from 'node:util';

import type { CandidateRepositoryPort } from '@trapmap/backend-core';
import type { CandidateSubmission, DuplicateCase, EntityLineage } from '@trapmap/contracts';

export interface CandidateIngestionSnapshot {
  candidateSubmissions: readonly CandidateSubmission[];
  duplicateCases: readonly DuplicateCase[];
  entityLineage: readonly EntityLineage[];
}

export interface CandidateIngestionSnapshotOwner {
  candidateRepo: Pick<CandidateRepositoryPort, 'insert' | 'getById'>;
  duplicateCases: {
    upsert(record: DuplicateCase): Promise<void>;
    getById(recordId: string): Promise<DuplicateCase | null>;
  };
  lineage: {
    insert(record: EntityLineage): Promise<void>;
    getById(recordId: string): Promise<EntityLineage | null>;
  };
}

interface SnapshotDomainResult {
  migrated: number;
  skipped: number;
  errors: Array<{ recordId: string; error: string }>;
}

interface SnapshotVerification {
  domain: keyof CandidateIngestionSnapshot;
  snapshotCount: number;
  destinationCount: number;
  matched: boolean;
}

export interface CandidateIngestionSnapshotBackfillResult {
  domains: Record<keyof CandidateIngestionSnapshot, SnapshotDomainResult>;
  verification: SnapshotVerification[];
}

export interface CandidateIngestionSnapshotBackfillConfig {
  owner: CandidateIngestionSnapshotOwner;
  snapshot: CandidateIngestionSnapshot;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, canonicalize(item)]],
      ),
    );
  }
  return value;
}

function recordsMatch<T>(left: T, right: T): boolean {
  return isDeepStrictEqual(canonicalize(left), canonicalize(right));
}

async function migrateDomain<T extends { id: string }>(input: {
  records: readonly T[];
  read(recordId: string): Promise<T | null>;
  write(record: T): Promise<void>;
  matches?: (left: T, right: T) => boolean;
}): Promise<{ result: SnapshotDomainResult; destinationCount: number }> {
  const result: SnapshotDomainResult = { migrated: 0, skipped: 0, errors: [] };
  const matches = input.matches ?? recordsMatch;

  for (const record of input.records) {
    try {
      const existing = await input.read(record.id);
      if (existing) {
        if (!matches(existing, record)) {
          result.errors.push({
            recordId: record.id,
            error: 'destination record differs from snapshot',
          });
        } else {
          result.skipped += 1;
        }
        continue;
      }
      await input.write(record);
      result.migrated += 1;
    } catch (error) {
      result.errors.push({
        recordId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const destinationCount = (
    await Promise.all(input.records.map((record) => input.read(record.id)))
  ).filter((record, index) => record !== null && matches(record, input.records[index]!)).length;

  return { result, destinationCount };
}

/**
 * Task 9-only migration from a legacy snapshot into candidate-ingestion-owned
 * tables. It is idempotent and refuses to overwrite conflicting records.
 */
export async function migrateCandidateIngestionSnapshot(
  config: CandidateIngestionSnapshotBackfillConfig,
): Promise<CandidateIngestionSnapshotBackfillResult> {
  const candidates = await migrateDomain({
    records: config.snapshot.candidateSubmissions,
    read: (recordId) => config.owner.candidateRepo.getById(recordId),
    write: (record) => config.owner.candidateRepo.insert(record),
    // The owner read projection joins duplicate cases, while the legacy
    // snapshot persists that relationship as its own bucket.
    matches: (existing, record) =>
      recordsMatch({ ...existing, duplicateCase: null }, { ...record, duplicateCase: null }),
  });
  const duplicateCases = await migrateDomain({
    records: config.snapshot.duplicateCases,
    read: (recordId) => config.owner.duplicateCases.getById(recordId),
    write: (record) => config.owner.duplicateCases.upsert(record),
  });
  const lineage = await migrateDomain({
    records: config.snapshot.entityLineage,
    read: (recordId) => config.owner.lineage.getById(recordId),
    write: (record) => config.owner.lineage.insert(record),
  });

  const domains = {
    candidateSubmissions: candidates.result,
    duplicateCases: duplicateCases.result,
    entityLineage: lineage.result,
  };
  const verification: SnapshotVerification[] = [
    {
      domain: 'candidateSubmissions',
      snapshotCount: config.snapshot.candidateSubmissions.length,
      destinationCount: candidates.destinationCount,
      matched:
        candidates.destinationCount === config.snapshot.candidateSubmissions.length &&
        candidates.result.errors.length === 0,
    },
    {
      domain: 'duplicateCases',
      snapshotCount: config.snapshot.duplicateCases.length,
      destinationCount: duplicateCases.destinationCount,
      matched:
        duplicateCases.destinationCount === config.snapshot.duplicateCases.length &&
        duplicateCases.result.errors.length === 0,
    },
    {
      domain: 'entityLineage',
      snapshotCount: config.snapshot.entityLineage.length,
      destinationCount: lineage.destinationCount,
      matched:
        lineage.destinationCount === config.snapshot.entityLineage.length &&
        lineage.result.errors.length === 0,
    },
  ];

  return { domains, verification };
}
