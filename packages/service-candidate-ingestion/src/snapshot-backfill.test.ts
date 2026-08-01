import type { CandidateSubmission, DuplicateCase, EntityLineage } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  type CandidateIngestionSnapshotOwner,
  migrateCandidateIngestionSnapshot,
} from './snapshot-backfill.js';

const candidate: CandidateSubmission = {
  id: 'candidate_legacy_1',
  sourceType: 'skill',
  submittedBy: 'user_1',
  teamId: 'team_1',
  status: 'ready_for_review',
  originalPayload: { title: 'Legacy candidate' },
  analysisSnapshot: {
    normalizedAt: '2026-07-21T00:00:00.000Z',
    fingerprint: 'sha256:legacy',
    keywords: ['legacy'],
    tokens: ['candidate'],
  },
  duplicateCase: null,
  receivedAt: '2026-07-21T00:00:00.000Z',
  queuedAt: '2026-07-21T00:01:00.000Z',
  analyzingAt: null,
  completedAt: '2026-07-21T00:02:00.000Z',
  lastError: null,
  retryCount: 0,
  manualResult: {
    decision: 'independent',
    notes: 'Approved during legacy review',
    submittedAt: '2026-07-21T00:02:00.000Z',
    submittedBy: 'reviewer_1',
  },
};

const duplicateCase: DuplicateCase = {
  id: 'duplicate_legacy_1',
  candidateId: candidate.id,
  detectedAt: '2026-07-21T00:01:30.000Z',
  detectionVersion: 'legacy-v1',
  highestSimilarity: 0.91,
  hasExactDuplicate: false,
  duplicateType: 'semantic',
  matches: [],
};

const lineage: EntityLineage = {
  id: 'lineage_legacy_1',
  candidateId: candidate.id,
  relationshipType: 'published_as',
  sourceType: 'candidate',
  sourceId: candidate.id,
  targetType: 'skill',
  targetId: 'skill_1',
  createdAt: '2026-07-21T00:02:00.000Z',
  notes: 'Legacy publication',
};

function createOwner(): CandidateIngestionSnapshotOwner {
  const candidates = new Map<string, CandidateSubmission>();
  const duplicateCases = new Map<string, DuplicateCase>();
  const lineages = new Map<string, EntityLineage>();

  return {
    candidateRepo: {
      insert: vi.fn(async (record) => {
        candidates.set(record.id, record);
      }),
      getById: vi.fn(async (id) => {
        const record = candidates.get(id);
        const duplicateCase = [...duplicateCases.values()].find(
          (candidateCase) => candidateCase.candidateId === id,
        );
        return record
          ? {
              status: record.status,
              id: record.id,
              ...record,
              duplicateCase: duplicateCase ?? null,
            }
          : null;
      }),
    },
    duplicateCases: {
      upsert: vi.fn(async (record) => {
        duplicateCases.set(record.id, record);
      }),
      getById: vi.fn(async (id) => duplicateCases.get(id) ?? null),
    },
    lineage: {
      insert: vi.fn(async (record) => {
        lineages.set(record.id, record);
      }),
      getById: vi.fn(async (id) => lineages.get(id) ?? null),
    },
  };
}

describe('candidate-ingestion legacy snapshot backfill', () => {
  it('preserves every owner record and verifies an idempotent rerun', async () => {
    const owner = createOwner();
    const snapshot = {
      candidateSubmissions: [candidate],
      duplicateCases: [duplicateCase],
      entityLineage: [lineage],
    };

    const first = await migrateCandidateIngestionSnapshot({ owner, snapshot });

    expect(first).toMatchObject({
      domains: {
        candidateSubmissions: { migrated: 1, skipped: 0, errors: [] },
        duplicateCases: { migrated: 1, skipped: 0, errors: [] },
        entityLineage: { migrated: 1, skipped: 0, errors: [] },
      },
      verification: [
        { domain: 'candidateSubmissions', snapshotCount: 1, destinationCount: 1, matched: true },
        { domain: 'duplicateCases', snapshotCount: 1, destinationCount: 1, matched: true },
        { domain: 'entityLineage', snapshotCount: 1, destinationCount: 1, matched: true },
      ],
    });

    await expect(migrateCandidateIngestionSnapshot({ owner, snapshot })).resolves.toMatchObject({
      domains: {
        candidateSubmissions: { migrated: 0, skipped: 1, errors: [] },
        duplicateCases: { migrated: 0, skipped: 1, errors: [] },
        entityLineage: { migrated: 0, skipped: 1, errors: [] },
      },
    });
  });

  it('refuses to overwrite a destination record that differs from the snapshot', async () => {
    const owner = createOwner();
    await owner.candidateRepo.insert({
      ...candidate,
      originalPayload: { title: 'Conflicting destination candidate' },
    });

    const result = await migrateCandidateIngestionSnapshot({
      owner,
      snapshot: {
        candidateSubmissions: [candidate],
        duplicateCases: [],
        entityLineage: [],
      },
    });

    expect(result.domains.candidateSubmissions).toEqual({
      migrated: 0,
      skipped: 0,
      errors: [{ recordId: candidate.id, error: 'destination record differs from snapshot' }],
    });
    expect(result.verification[0]).toMatchObject({ destinationCount: 0, matched: false });
  });
});
