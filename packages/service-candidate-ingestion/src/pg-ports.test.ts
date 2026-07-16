import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AnalysisSnapshot, CandidateSubmission, DuplicateCase } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createCandidateIngestionPgOwnerBundle } from './pg-ports.js';

const candidate = {
  id: 'candidate-1',
  sourceType: 'skill',
  submittedBy: 'user-1',
  teamId: 'team-1',
  status: 'received',
  originalPayload: { skill: { name: 'Owner-local candidate' } },
  analysisSnapshot: null,
  duplicateCase: null,
  receivedAt: '2026-07-16T00:00:00.000Z',
  queuedAt: null,
  analyzingAt: null,
  completedAt: null,
  lastError: null,
  retryCount: 0,
  manualResult: null,
} as CandidateSubmission;

const analysis = {
  normalizedAt: '2026-07-16T00:01:00.000Z',
  fingerprint: 'sha256:owner-local',
  keywords: ['owner'],
  tokens: ['local'],
} as AnalysisSnapshot;

const duplicateCase = {
  id: 'duplicate-1',
  candidateId: candidate.id,
  detectedAt: '2026-07-16T00:02:00.000Z',
  detectionVersion: 'v1',
  highestSimilarity: 0.98,
  hasExactDuplicate: false,
  duplicateType: 'semantic',
  matches: [
    {
      entityType: 'skill',
      entityId: 'skill-1',
      entityTitle: 'Existing skill',
      similarityScore: 0.98,
      matchType: 'semantic-similar',
      overlapDetails: {
        sharedKeywords: ['owner'],
        sharedTokens: ['local'],
        textOverlapPercent: 80,
      },
    },
  ],
} as DuplicateCase;

function createPool(
  queryResult: (sql: string) => { rows: Record<string, unknown>[] } = () => ({ rows: [] }),
) {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      return queryResult(sql);
    }),
    release: vi.fn(),
  };
  return {
    calls,
    client,
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return queryResult(sql);
      }),
    },
  };
}

function expectCommitted(calls: string[], fragments: string[]): void {
  expect(calls).toEqual(
    expect.arrayContaining([
      'BEGIN',
      ...fragments.map((fragment) => expect.stringContaining(fragment)),
      'COMMIT',
    ]),
  );
  expect(calls).not.toContain('ROLLBACK');
}

function expectNoSql(calls: string[], fragment: string): void {
  expect(calls.some((sql) => sql.includes(fragment))).toBe(false);
}

describe('candidate-ingestion PostgreSQL owner bundle', () => {
  it('constructs PG-only collaborators and makes repeated candidate inserts idempotent', async () => {
    const { calls, client, pool } = createPool();
    const owner = createCandidateIngestionPgOwnerBundle(pool as never);

    await owner.candidateRepo.insert(candidate);
    await owner.candidateRepo.insert(candidate);

    expect(owner).toEqual(
      expect.objectContaining({
        candidateRepo: expect.objectContaining({
          getById: expect.any(Function),
          listByStatus: expect.any(Function),
          findByFingerprint: expect.any(Function),
        }),
        duplicateCases: expect.objectContaining({ upsert: expect.any(Function) }),
        resolutionOutcomes: expect.objectContaining({ upsert: expect.any(Function) }),
        lineage: expect.objectContaining({ insert: expect.any(Function) }),
      }),
    );
    expect(calls.filter((sql) => sql.includes('INSERT INTO candidates'))).toHaveLength(2);
    expect(calls.filter((sql) => sql.includes('ON CONFLICT (id) DO NOTHING'))).toHaveLength(2);
    expectCommitted(calls, ['INSERT INTO candidates']);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['queued', 'queued_at'],
    ['analyzing', 'analyzing_at'],
    ['error', 'last_error'],
    ['resolved', 'completed_at'],
  ] as const)('persists the %s status transition transactionally', async (status, column) => {
    const { calls, client, pool } = createPool((sql) =>
      sql.includes('FOR UPDATE') ? { rows: [{ id: candidate.id }] } : { rows: [] },
    );

    await createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo.updateStatus(
      candidate.id,
      status,
      'processing failed',
    );

    expectCommitted(calls, ['SELECT id, status', `UPDATE candidates SET status = $1, ${column}`]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('writes analysis, duplicate matches, and manual results in separate safe transactions', async () => {
    const { calls, client, pool } = createPool((sql) =>
      sql.includes('FOR UPDATE') ? { rows: [{ id: candidate.id }] } : { rows: [] },
    );
    const owner = createCandidateIngestionPgOwnerBundle(pool as never);

    await owner.candidateRepo.attachAnalysis(candidate.id, analysis);
    await owner.candidateRepo.attachDuplicateCase(candidate.id, duplicateCase);
    await owner.candidateRepo.attachManualResult(
      candidate.id,
      {
        decision: 'merged',
        notes: 'same skill',
        mergedWith: { entityType: 'skill', entityId: 'skill-1' },
      },
      'reviewer-1',
    );

    expectCommitted(calls, [
      'INSERT INTO candidate_analyses',
      'INSERT INTO candidate_duplicate_cases',
      'DELETE FROM candidate_duplicate_matches',
      'INSERT INTO candidate_duplicate_matches',
      'INSERT INTO candidate_manual_results',
    ]);
    expect(calls.filter((sql) => sql === 'BEGIN')).toHaveLength(3);
    expect(client.release).toHaveBeenCalledTimes(3);
  });

  it('maps candidate reads, status lists, and fingerprint matches from PostgreSQL rows', async () => {
    const row = {
      id: candidate.id,
      source_type: candidate.sourceType,
      submitted_by_user_id: candidate.submittedBy,
      team_id: candidate.teamId,
      status: candidate.status,
      original_payload: candidate.originalPayload,
      analysis_snapshot: null,
      duplicate_case: null,
      received_at: new Date(candidate.receivedAt),
      queued_at: null,
      analyzing_at: null,
      completed_at: null,
      last_error: null,
      retry_count: 0,
      manual_result: null,
    };
    const { pool } = createPool((sql) => {
      if (sql.includes('candidate_analyses') && sql.includes('JOIN'))
        return { rows: [{ id: candidate.id }] };
      if (sql.includes('FROM candidates')) return { rows: [row] };
      return { rows: [] };
    });
    const repository = createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo;

    await expect(repository.getById(candidate.id)).resolves.toMatchObject({
      id: candidate.id,
      sourceType: 'skill',
      receivedAt: candidate.receivedAt,
    });
    await expect(repository.listByStatus('received')).resolves.toMatchObject([
      { id: candidate.id },
    ]);
    await expect(repository.findByFingerprint(analysis.fingerprint)).resolves.toBe(candidate.id);
  });

  it('persists idempotent resolution outcomes and lineage records through local collaborators', async () => {
    const { calls, client, pool } = createPool();
    const owner = createCandidateIngestionPgOwnerBundle(pool as never);
    const outcome = {
      candidateId: candidate.id,
      decision: 'independent' as const,
      publishedEntityId: 'skill-2',
      mergedIntoEntityId: null,
      entityType: 'skill' as const,
      resolvedAt: '2026-07-16T00:03:00.000Z',
      resolvedBy: 'reviewer-1',
      notes: 'approved',
    };
    const lineage = {
      id: 'lineage-1',
      candidateId: candidate.id,
      relationshipType: 'published_as' as const,
      sourceType: 'candidate' as const,
      sourceId: candidate.id,
      targetType: 'skill' as const,
      targetId: 'skill-2',
      createdAt: '2026-07-16T00:03:00.000Z',
      notes: 'approved',
    };

    await owner.resolutionOutcomes.upsert(outcome);
    await owner.resolutionOutcomes.upsert(outcome);
    await owner.lineage.insert(lineage);
    await owner.lineage.insert(lineage);

    expect(calls.filter((sql) => sql.includes('candidate_resolution_outcomes'))).toHaveLength(2);
    expect(calls.filter((sql) => sql.includes('entity_lineage'))).toHaveLength(2);
    expect(calls.filter((sql) => sql.includes('ON CONFLICT'))).toHaveLength(4);
    expectCommitted(calls, ['candidate_resolution_outcomes', 'entity_lineage']);
    expect(client.release).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['queued', null],
    ['analyzing', null],
    ['resolved', null],
    ['error', 'processing failed'],
  ] as const)('does not mutate an already-%s candidate on retry', async (status, lastError) => {
    const { calls, client, pool } = createPool((sql) =>
      sql.includes('FOR UPDATE')
        ? { rows: [{ id: candidate.id, status, last_error: lastError, retry_count: 3 }] }
        : { rows: [] },
    );

    await createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo.updateStatus(
      candidate.id,
      status,
      lastError ?? undefined,
    );

    expectNoSql(calls, 'UPDATE candidates');
    expectNoSql(calls, 'retry_count = retry_count + 1');
    expect(calls).toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('preserves the first manual-result submittedAt and candidate payload on an identical retry', async () => {
    const submittedAt = '2026-07-16T00:04:00.000Z';
    const { calls, client, pool } = createPool((sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: candidate.id }] };
      if (sql.includes('FROM candidate_manual_results')) {
        return {
          rows: [
            {
              candidate_id: candidate.id,
              decision: 'merged',
              notes: 'same skill',
              merged_with_entity_type: 'skill',
              merged_with_entity_id: 'skill-1',
              merged_with_entity_title: null,
              submitted_at: new Date(submittedAt),
              submitted_by_user_id: 'reviewer-1',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo.attachManualResult(
      candidate.id,
      {
        decision: 'merged',
        notes: 'same skill',
        mergedWith: { entityType: 'skill', entityId: 'skill-1' },
      },
      'reviewer-1',
    );

    expectNoSql(calls, 'UPDATE candidates SET manual_result');
    expectNoSql(calls, 'INSERT INTO candidate_manual_results');
    expect(calls).toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('preserves the first analysis and candidate payload on an identical retry', async () => {
    const { calls, client, pool } = createPool((sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: candidate.id }] };
      if (sql.includes('FROM candidate_analyses')) {
        return {
          rows: [
            {
              candidate_id: candidate.id,
              normalized_at: new Date(analysis.normalizedAt),
              fingerprint: analysis.fingerprint,
              keywords: analysis.keywords,
              tokens: analysis.tokens,
              duplicate_trace: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo.attachAnalysis(
      candidate.id,
      analysis,
    );

    expectNoSql(calls, 'UPDATE candidates SET analysis_snapshot');
    expectNoSql(calls, 'INSERT INTO candidate_analyses');
    expect(calls).toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not delete or reinsert non-empty duplicate matches on an identical retry', async () => {
    const { calls, client, pool } = createPool((sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: candidate.id }] };
      if (sql.includes('FROM candidate_duplicate_cases')) {
        return {
          rows: [
            {
              id: duplicateCase.id,
              candidate_id: duplicateCase.candidateId,
              detected_at: new Date(duplicateCase.detectedAt),
              detection_version: duplicateCase.detectionVersion,
              highest_similarity: duplicateCase.highestSimilarity,
              has_exact_duplicate: 0,
              duplicate_type: duplicateCase.duplicateType,
            },
          ],
        };
      }
      if (sql.includes('FROM candidate_duplicate_matches')) {
        return {
          rows: [
            {
              duplicate_case_id: duplicateCase.id,
              entity_type: 'skill',
              entity_id: 'skill-1',
              entity_title: 'Existing skill',
              similarity_score: 0.98,
              match_type: 'semantic-similar',
              shared_keywords: ['owner'],
              shared_tokens: ['local'],
              text_overlap_percent: 80,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await createCandidateIngestionPgOwnerBundle(pool as never).candidateRepo.attachDuplicateCase(
      candidate.id,
      duplicateCase,
    );

    expectNoSql(calls, 'UPDATE candidates SET duplicate_case');
    expectNoSql(calls, 'DELETE FROM candidate_duplicate_matches');
    expectNoSql(calls, 'INSERT INTO candidate_duplicate_matches');
    expect(calls).toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('keeps production service files independent from server and runtime-infra schemas', async () => {
    const directory = new URL('.', import.meta.url);
    const names = await readdir(directory);
    const productionFiles = names.filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    const sources = await Promise.all(
      productionFiles.map(async (name) => readFile(join(directory.pathname, name), 'utf8')),
    );

    expect(sources.join('\n')).not.toMatch(/@trapmap\/(server|runtime-infra)/);
    expect(sources.join('\n')).not.toContain('@trapmap/persistence-schema');
  });

  it('does not retain the deprecated persistence-schema project reference', async () => {
    const tsconfig = await readFile(new URL('../tsconfig.json', import.meta.url), 'utf8');

    expect(tsconfig).not.toContain('../persistence-schema');
  });
});
