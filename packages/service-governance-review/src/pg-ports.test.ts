import { describe, expect, it, vi } from 'vitest';

import { createGovernanceReviewPgOwnerBundle } from './pg-ports.js';

function createPool() {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    pool: {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [] };
      }),
    },
  };
}

describe('governance-review PostgreSQL owner bundle', () => {
  it('persists the complete feedback record into the authoritative feedback tables', async () => {
    const { calls, pool } = createPool();
    const owner = createGovernanceReviewPgOwnerBundle(pool as never);

    await owner.feedbackRepo.insert({
      id: 'feedback_abc123',
      entryId: 'entry-1',
      entryType: 'trap',
      problemType: 'incorrect',
      description: 'owner-local feedback',
      context: 'search result',
      querySeed: 'seed',
      queryId: 'query-1',
      routeFamily: 'search',
      failureClassification: 'incorrect-answer',
      expectedCorrection: 'correct answer',
      selectedResultSnapshot: { rank: 1 },
      submittedAt: '2026-07-18T00:00:00.000Z',
      submittedByUserId: 'user-1',
      submittedByHandle: 'alice',
      status: 'new',
      adminNotes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      triggeredTransition: null,
      remediationStatus: 'pending-human-review',
      remediationOpenedAt: '2026-07-18T01:00:00.000Z',
      remediationOpenedByUserId: 'admin-1',
      remediationResolvedAt: null,
      remediationResolvedByUserId: null,
      customAnswers: [{ prompt: 'What happened?', answer: 'Wrong result' }],
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    } as never);

    expect(calls[0]?.sql).toContain('INSERT INTO feedback_records');
    expect(calls[0]?.sql).toContain('entry_type');
    expect(calls[0]?.sql).toContain('submitted_by_user_id');
    expect(calls[0]?.sql).toContain('remediation_opened_by_user_id');
    expect(calls[0]?.values).toEqual(
      expect.arrayContaining([
        'feedback_abc123',
        'trap',
        'user-1',
        'alice',
        'pending-human-review',
      ]),
    );
    expect(calls[1]?.sql).toContain('INSERT INTO feedback_custom_answers');
    expect(calls[1]?.values).toEqual(['feedback_abc123', 'What happened?', 'Wrong result']);
    expect(calls.flatMap(({ sql }) => sql.match(/feedback_queue/g) ?? [])).toEqual([]);
  });

  it('hydrates custom answers and maps database rows to the feedback port record', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM feedback_records')) {
        return {
          rows: [
            {
              id: 'feedback_abc123',
              entry_id: 'entry-1',
              entry_type: 'trap',
              problem_type: 'incorrect',
              description: 'owner-local feedback',
              context: null,
              query_seed: null,
              query_id: 'query-1',
              route_family: null,
              failure_classification: null,
              expected_correction: null,
              selected_result_snapshot: { rank: 1 },
              submitted_at: new Date('2026-07-18T00:00:00.000Z'),
              submitted_by_user_id: 'user-1',
              submitted_by_handle: 'alice',
              status: 'new',
              admin_notes: 'reviewed',
              resolved_at: new Date('2026-07-18T02:00:00.000Z'),
              resolved_by_user_id: 'admin-2',
              triggered_transition: 'reindex',
              remediation_status: 'ready-to-reindex',
              remediation_opened_at: new Date('2026-07-18T01:00:00.000Z'),
              remediation_opened_by_user_id: 'admin-1',
              remediation_resolved_at: null,
              remediation_resolved_by_user_id: null,
              created_at: new Date('2026-07-18T00:00:00.000Z'),
              updated_at: new Date('2026-07-18T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM feedback_custom_answers')) {
        return { rows: [{ question_key: 'What happened?', answer_text: 'Wrong result' }] };
      }
      return { rows: [] };
    });
    const owner = createGovernanceReviewPgOwnerBundle({ query } as never);

    await expect(owner.feedbackRepo.getById('feedback_abc123')).resolves.toMatchObject({
      id: 'feedback_abc123',
      entryId: 'entry-1',
      entryType: 'trap',
      submittedByUserId: 'user-1',
      customAnswers: [{ prompt: 'What happened?', answer: 'Wrong result' }],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('feedback_records'), [
      'feedback_abc123',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('feedback_custom_answers'), [
      'feedback_abc123',
    ]);
  });

  it('filters and updates feedback records without losing remediation fields', async () => {
    const { calls, pool } = createPool();
    const owner = createGovernanceReviewPgOwnerBundle(pool as never);

    await owner.feedbackRepo.listByFilter({
      status: ['triaged'],
      problemType: ['outdated'],
      entryId: 'entry-1',
      entryType: 'skill',
    });
    await owner.feedbackRepo.update('feedback_abc123', {
      status: 'resolved',
      remediationStatus: 'ready-to-reindex',
      remediationResolvedByUserId: 'admin-1',
    });

    expect(calls[0]).toMatchObject({
      sql: expect.stringContaining(
        'FROM feedback_records WHERE status = ANY($1) AND problem_type = ANY($2) AND entry_id = $3 AND entry_type = $4',
      ),
      values: [['triaged'], ['outdated'], 'entry-1', 'skill'],
    });
    expect(calls[1]).toMatchObject({
      sql: expect.stringContaining(
        'UPDATE feedback_records SET status = $1, remediation_status = $2, remediation_resolved_by_user_id = $3, updated_at = NOW()',
      ),
      values: ['resolved', 'ready-to-reindex', 'admin-1', 'feedback_abc123'],
    });
  });

  it('owns conflict persistence behind the shared knowledge-read projection', async () => {
    const { calls, pool } = createPool();
    const owner = createGovernanceReviewPgOwnerBundle(pool as never);

    await owner.conflictProjection.upsert({
      id: 'conflict_abc123',
      entryIdA: 'entry-a',
      entryIdB: 'entry-b',
      conflictType: 'contradictory',
      context: 'Opposite instructions',
      problemOverlapScore: 0.9,
      solutionDiffScore: 0.9,
      detectedAt: '2026-07-18T00:00:00.000Z',
    });
    await owner.conflictProjection.listByEntryIds(['entry-a', 'entry-b']);

    expect(calls[0]).toMatchObject({
      sql: expect.stringContaining('INSERT INTO conflict_relations'),
      values: expect.arrayContaining(['conflict_abc123', 'entry-a', 'entry-b', 'contradictory']),
    });
    expect(calls[1]).toMatchObject({
      sql: expect.stringContaining('FROM conflict_relations'),
      values: [['entry-a', 'entry-b']],
    });
  });

  it('exposes a governance retrieval projection for retrieval consumers', async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM feedback_records')) {
        return {
          rows: [
            {
              id: 'feedback_abc123',
              entry_id: 'entry-a',
              entry_type: 'trap',
              problem_type: 'incorrect',
              description: 'owner-local feedback',
              context: null,
              query_seed: null,
              query_id: null,
              route_family: null,
              failure_classification: null,
              expected_correction: null,
              selected_result_snapshot: null,
              submitted_at: new Date('2026-07-18T00:00:00.000Z'),
              submitted_by_user_id: 'user-1',
              submitted_by_handle: 'alice',
              status: 'new',
              admin_notes: 'reviewed',
              resolved_at: new Date('2026-07-18T02:00:00.000Z'),
              resolved_by_user_id: 'admin-2',
              triggered_transition: 'reindex',
              remediation_status: 'ready-to-reindex',
              remediation_opened_at: new Date('2026-07-18T01:00:00.000Z'),
              remediation_opened_by_user_id: 'admin-1',
              remediation_resolved_at: null,
              remediation_resolved_by_user_id: null,
              created_at: new Date('2026-07-18T00:00:00.000Z'),
              updated_at: new Date('2026-07-18T00:00:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('FROM feedback_custom_answers')) {
        return { rows: [{ question_key: 'What happened?', answer_text: 'Wrong result' }] };
      }
      if (sql.includes('FROM conflict_relations')) {
        return {
          rows: [
            {
              id: 'conflict_abc123',
              entry_id_a: 'entry-a',
              entry_id_b: 'entry-b',
              conflict_type: 'contradictory',
              context: 'Opposite instructions',
              problem_overlap_score: 0.9,
              solution_diff_score: 0.9,
              detected_at: new Date('2026-07-18T00:00:00.000Z'),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const owner = createGovernanceReviewPgOwnerBundle({ query } as never);

    await expect(owner.retrievalProjection.listFeedback()).resolves.toEqual([
      expect.objectContaining({
        id: 'feedback_abc123',
        entryId: 'entry-a',
        customAnswers: [{ prompt: 'What happened?', answer: 'Wrong result' }],
        adminNotes: 'reviewed',
        resolvedAt: '2026-07-18T02:00:00.000Z',
        resolvedByUserId: 'admin-2',
        triggeredTransition: 'reindex',
        remediationStatus: 'ready-to-reindex',
        remediationOpenedAt: '2026-07-18T01:00:00.000Z',
        remediationOpenedByUserId: 'admin-1',
      }),
    ]);
    await expect(owner.retrievalProjection.listConflicts(['entry-a'])).resolves.toEqual([
      {
        id: 'conflict_abc123',
        entryIdA: 'entry-a',
        entryIdB: 'entry-b',
        conflictType: 'contradictory',
        context: 'Opposite instructions',
        problemOverlapScore: 0.9,
        solutionDiffScore: 0.9,
        detectedAt: '2026-07-18T00:00:00.000Z',
      },
    ]);
    const queryCount = query.mock.calls.length;
    await expect(owner.retrievalProjection.listConflicts([])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(queryCount);
  });

  it('returns owner-computed remediation projections for selected entries', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM feedback_records')) {
        return {
          rows: Array.from({ length: 10 }, (_, index) => ({
            id: `feedback-${index + 1}`,
            entry_id: 'entry-a',
            entry_type: 'trap',
            problem_type: 'incorrect',
            description: 'wrong answer',
            context: null,
            query_seed: null,
            query_id: null,
            route_family: null,
            failure_classification: null,
            expected_correction: null,
            selected_result_snapshot: null,
            submitted_at: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
            submitted_by_user_id: 'user-1',
            submitted_by_handle: 'alice',
            status: 'new',
            admin_notes: null,
            resolved_at: null,
            resolved_by_user_id: null,
            triggered_transition: null,
            remediation_status: null,
            remediation_opened_at: null,
            remediation_opened_by_user_id: null,
            remediation_resolved_at: null,
            remediation_resolved_by_user_id: null,
            created_at: new Date('2026-07-01T00:00:00.000Z'),
            updated_at: new Date('2026-07-01T00:00:00.000Z'),
          })),
        };
      }
      return { rows: [] };
    });
    const owner = createGovernanceReviewPgOwnerBundle({ query } as never);

    await expect(
      owner.retrievalProjection.listRemediation(['entry-a', 'entry-missing']),
    ).resolves.toEqual([
      {
        entryId: 'entry-a',
        remediation: expect.objectContaining({
          status: 'pending-human-review',
          triggeredByFeedbackCount: 10,
          suppressedFromRetrieval: true,
        }),
      },
    ]);
  });
});
