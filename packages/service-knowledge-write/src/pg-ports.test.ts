import { describe, expect, it, vi } from 'vitest';

import {
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
} from './pg-ports.js';
import { createTransactionPool } from './test-helpers.js';

type KnowledgeOwner = ReturnType<typeof createKnowledgeWriteOwnerBundle>['knowledgeOwner'];
type KnowledgeOperation = (owner: KnowledgeOwner) => Promise<unknown>;

function expectSuccessfulTransaction(calls: string[], sqlFragments: string[]): void {
  expect(calls).toEqual(
    expect.arrayContaining([
      'BEGIN',
      ...sqlFragments.map((fragment) => expect.stringContaining(fragment)),
      'COMMIT',
    ]),
  );
  expect(calls).not.toContain('ROLLBACK');
}

function createOutboxFailurePool(lifecycleState: string) {
  return createTransactionPool((sql) => {
    if (sql.includes('SELECT lifecycle_state')) {
      return { rows: [{ lifecycle_state: lifecycleState }] };
    }
    if (sql.includes('RETURNING *')) {
      return { rows: [{ id: 'entry-1', lifecycle_state: 'approved' }] };
    }
    if (sql.includes('INSERT INTO domain_event_outbox')) {
      throw new Error('outbox unavailable');
    }
    return { rows: [] };
  });
}

async function expectOutboxRollback(
  operation: KnowledgeOperation,
  lifecycleState: string,
  sqlFragments: string[] = [],
): Promise<void> {
  const { calls, client, pool } = createOutboxFailurePool(lifecycleState);
  const owner = createKnowledgeWriteOwnerBundle(pool as never);

  await expect(operation(owner.knowledgeOwner)).rejects.toThrow('outbox unavailable');

  expect(calls).toEqual(
    expect.arrayContaining([
      'BEGIN',
      ...sqlFragments.map((fragment) => expect.stringContaining(fragment)),
      'ROLLBACK',
    ]),
  );
  expect(calls).not.toContain('COMMIT');
  expect(client.release).toHaveBeenCalledOnce();
}

const outboxRollbackCases: Array<{
  name: string;
  lifecycleState: string;
  operation: KnowledgeOperation;
  sqlFragments?: string[];
}> = [
  {
    name: 'maintenance decision',
    lifecycleState: 'approved',
    operation: (owner) =>
      owner.applyMaintenanceDecision({
        entryId: 'entry-1',
        actorId: 'maintainer-1',
        action: 'refresh',
      }),
    sqlFragments: ['UPDATE knowledge_entries SET maintenance_meta'],
  },
  {
    name: 'decay decision',
    lifecycleState: 'approved',
    operation: (owner) =>
      owner.applyDecayDecision({
        entryId: 'entry-1',
        actorId: 'decay-worker',
        action: 'suppress',
      }),
  },
  {
    name: 'review decision',
    lifecycleState: 'agent-pass',
    operation: (owner) =>
      owner.approveReviewDecision({
        entryId: 'entry-1',
        actorId: 'reviewer-1',
        note: 'approved',
      }),
  },
  {
    name: 'supersede decision',
    lifecycleState: 'approved',
    operation: (owner) => owner.supersede('entry-1', 'replacement-1', 'editor-1'),
    sqlFragments: [
      "UPDATE knowledge_entries SET lifecycle_state = 'deactivated'",
      'INSERT INTO knowledge_revisions',
      'INSERT INTO lifecycle_events',
    ],
  },
];

describe('knowledge-write PostgreSQL owner bundle', () => {
  it('persists a submission aggregate and its outbox event in one transaction', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await owner.knowledgeOwner.submit({
      actorId: 'author-1',
      content: 'owner-local content',
      title: 'Owner-local title',
      labels: ['wave-2'],
      teamId: 'team-1',
    });

    expectSuccessfulTransaction(calls, [
      'INSERT INTO knowledge_entries',
      'INSERT INTO knowledge_revisions',
      'INSERT INTO knowledge_labels',
      'INSERT INTO lifecycle_events',
      'INSERT INTO domain_event_outbox',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(outboxRollbackCases)(
    'rolls back a $name when its outbox event cannot persist',
    async (testCase) => {
      await expectOutboxRollback(
        testCase.operation,
        testCase.lifecycleState,
        testCase.sqlFragments,
      );
    },
  );

  it('queries owner projections with ids, ownership, lifecycle, team, labels, and operation filters', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('knowledge_entries')
        ? [{ id: 'entry-1', lifecycle_state: 'approved' }]
        : [],
    }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);

    await owner.knowledgeOwner.getByIds(['entry-1', 'entry-2']);
    await owner.knowledgeOwner.listByFilter({
      entryIds: ['entry-1'],
      ownerUserId: 'owner-1',
      teamId: 'team-1',
      lifecycleState: 'approved',
      labels: ['security'],
      operation: 'maintenance-due',
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('ANY'), expect.any(Array));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_user_id'), expect.any(Array));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('knowledge_labels'),
      expect.any(Array),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('maintenance_meta'),
      expect.any(Array),
    );
  });

  it('supports empty projection filters and decay eligibility filters', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('knowledge_entries') ? [{ id: 'entry-1' }] : [],
    }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);

    await owner.knowledgeOwner.listByFilter({});
    await owner.knowledgeOwner.listByFilter({ operation: 'decay-eligible' });

    expect(query).toHaveBeenNthCalledWith(1, expect.not.stringContaining('WHERE'), []);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("ke.lifecycle_state = 'approved'"),
      [],
    );
  });

  it('reads an indexable entry with its authoritative revision and metadata', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: 'entry-1',
          team_id: null,
          scope: 'global',
          labels: ['docker'],
          shortcut: 'Restart Docker',
          detail: 'Restart the Docker daemon.',
          required_level: 2,
          lifecycle_state: 'approved',
          boundary: null,
          updated_at: '2026-07-24T00:00:00.000Z',
          index_revision: 3,
          index_state: { adapters: { vector: { status: 'synced' } } },
          embedding_cache: {
            textHash: 'hash-1',
            vector: [0.1, 0.2],
            createdAt: '2026-07-24T00:00:00.000Z',
            revision: 3,
          },
        },
      ],
    }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);

    await expect(owner.knowledgeOwner.getIndexingEntry('entry-1')).resolves.toMatchObject({
      id: 'entry-1',
      lifecycleState: 'approved',
      revision: 3,
      indexState: { adapters: { vector: { status: 'synced' } } },
      embeddingCache: expect.objectContaining({ revision: 3 }),
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('MAX(kr.revision_no)'), ['entry-1']);
  });

  it('paginates owner-local indexing entries with authoritative revisions', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: 'entry-1',
          team_id: null,
          scope: 'global',
          labels: ['docker'],
          shortcut: 'Restart Docker',
          detail: 'Restart the Docker daemon.',
          required_level: 2,
          lifecycle_state: 'approved',
          boundary: null,
          updated_at: '2026-07-24T00:00:00.000Z',
          index_revision: 3,
          index_state: null,
          embedding_cache: null,
        },
        {
          id: 'entry-2',
          team_id: null,
          scope: 'global',
          labels: [],
          shortcut: 'Second',
          detail: 'Second entry.',
          required_level: 0,
          lifecycle_state: 'deactivated',
          boundary: null,
          updated_at: '2026-07-23T00:00:00.000Z',
          index_revision: 1,
          index_state: { adapters: {} },
          embedding_cache: null,
        },
      ],
    }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);

    await expect(
      owner.knowledgeOwner.listIndexingEntries({ offset: 0, limit: 1 }),
    ).resolves.toEqual({
      entries: [expect.objectContaining({ id: 'entry-1', revision: 3 })],
      nextOffset: 1,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1 OFFSET $2'), [2, 0]);
  });

  it('persists an embedding cache update through the knowledge owner port', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);

    await owner.knowledgeOwner.updateEmbeddingCache('entry-1', {
      textHash: 'hash-1',
      vector: [0.1, 0.2],
      createdAt: '2026-07-21T00:00:00.000Z',
      revision: 3,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE knowledge_entries SET embedding_cache = $2'),
      [
        'entry-1',
        JSON.stringify({
          textHash: 'hash-1',
          vector: [0.1, 0.2],
          createdAt: '2026-07-21T00:00:00.000Z',
          revision: 3,
        }),
      ],
    );
  });

  it('persists an index metadata checkpoint atomically through the knowledge owner port', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const owner = createKnowledgeWriteOwnerBundle({ query, connect: vi.fn() } as never);
    const indexState = {
      contentHash: 'hash-1',
      normalizedAt: '2026-07-24T00:00:00.000Z',
      adapters: {
        vector: {
          status: 'synced',
          revision: 3,
          contentHash: 'hash-1',
          lastSyncedAt: '2026-07-24T00:00:00.000Z',
          lastError: null,
        },
      },
    };
    const embeddingCache = {
      textHash: 'hash-1',
      vector: [0.1, 0.2],
      createdAt: '2026-07-24T00:00:00.000Z',
      revision: 3,
    };

    await owner.knowledgeOwner.updateIndexMetadata('entry-1', {
      indexState,
      embeddingCache,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE knowledge_entries SET index_state = $2, embedding_cache = $3',
      ),
      ['entry-1', JSON.stringify(indexState), JSON.stringify(embeddingCache)],
    );
  });

  it.each([
    ['revision', 'INSERT INTO knowledge_revisions'],
    ['lifecycle', 'INSERT INTO lifecycle_events'],
    ['outbox', 'INSERT INTO domain_event_outbox'],
  ])('rolls back a submission when %s persistence fails', async (_phase, sqlFragment) => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes(sqlFragment)) throw new Error(`${_phase} unavailable`);
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.submit({ actorId: 'author-1', content: 'content' }),
    ).rejects.toThrow(`${_phase} unavailable`);

    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back a decision when the entry does not exist', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.applyMaintenanceDecision({
        entryId: 'missing-entry',
        actorId: 'maintainer-1',
        action: 'refresh',
      }),
    ).rejects.toThrow('Knowledge entry missing-entry not found');

    expect(calls).toEqual([
      'BEGIN',
      'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('normalizes nullable read metadata for retrieval consumers', async () => {
    const owner = createKnowledgeWriteOwnerBundle({
      query: vi.fn(async () => ({
        rows: [
          {
            id: 'entry-1',
            detail: 'content',
            shortcut: 'title',
            labels: ['retrieval'],
            owner_user_id: 'owner-1',
            required_level: 2,
            lifecycle_state: 'approved',
            index_state: { adapters: { vector: { status: 'synced' } } },
          },
        ],
      })),
    } as never);

    const entry = await owner.knowledgeOwner.getById('entry-1');

    expect((entry as unknown as { decayMeta: unknown })?.decayMeta).toBeNull();
    expect((entry as unknown as { maintenanceMeta: unknown })?.maintenanceMeta).toBeNull();
    expect((entry as unknown as { requiredLevel: number })?.requiredLevel).toBe(2);
    expect((entry as unknown as { indexState: unknown })?.indexState).toEqual({
      adapters: { vector: { status: 'synced' } },
    });
  });

  it('writes entry edits, revisions, and their outbox event atomically', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'approved' }] };
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await owner.knowledgeOwner.updateEntry(
      'entry-1',
      {
        detail: 'revised detail',
        shortcut: 'Revised title',
        labels: ['revision'],
      },
      'editor-1',
    );

    expectSuccessfulTransaction(calls, [
      'UPDATE knowledge_entries SET detail',
      'INSERT INTO knowledge_revisions',
      'DELETE FROM knowledge_labels',
      'INSERT INTO knowledge_labels',
      'INSERT INTO domain_event_outbox',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('writes reviewed evidence and its projection event in one transaction', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'approved' }] };
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await owner.knowledgeOwner.reviewEvidence(
      'entry-1',
      {
        sourceType: 'doc',
        sourceRef: 'https://example.test/evidence',
        evidenceLevel: 'documented',
        verifiedAt: '2026-07-23T00:00:00.000Z',
        verifiedBy: { id: 'reviewer-1', handle: 'reviewer', securityLevel: 10 },
      },
      'reviewer-1',
    );

    expectSuccessfulTransaction(calls, [
      'UPDATE knowledge_entries SET evidence_meta',
      'INSERT INTO domain_event_outbox',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('persists a resubmission in one transaction with its revision, lifecycle, and outbox events', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'rejected' }] };
      }
      if (sql.includes('RETURNING *')) {
        return { rows: [{ id: 'entry-1', lifecycle_state: 'submitted' }] };
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await owner.knowledgeOwner.resubmit(
      'entry-1',
      { detail: 'revised detail', shortcut: 'Revised title', labels: ['revision'] },
      'editor-1',
    );

    expect(calls.filter((sql) => sql === 'BEGIN')).toHaveLength(1);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('UPDATE knowledge_entries SET detail'),
        expect.stringContaining('INSERT INTO knowledge_revisions'),
        expect.stringContaining('UPDATE knowledge_entries SET lifecycle_state'),
        expect.stringContaining('INSERT INTO lifecycle_events'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'COMMIT',
      ]),
    );
    expect(calls).not.toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('exposes the contracts-only knowledge owner compatibility port', () => {
    const owner = createKnowledgeWriteOwnerBundle({ query: vi.fn() } as never);

    expect(owner.knowledgeOwner).toEqual(
      expect.objectContaining({
        submit: expect.any(Function),
        updateEntry: expect.any(Function),
        resubmit: expect.any(Function),
        supersede: expect.any(Function),
        approveReviewDecision: expect.any(Function),
        rejectReviewDecision: expect.any(Function),
        applyMaintenanceDecision: expect.any(Function),
        applyDecayDecision: expect.any(Function),
        getById: expect.any(Function),
        listByFilter: expect.any(Function),
      }),
    );
  });

  it('reads outbox diagnostics without acquiring job-runtime mutation capabilities', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: '2' }] }));
    const diagnostics = createKnowledgeWriteOutboxDiagnostics({
      query,
    } as never);

    await expect(diagnostics.getStatusSnapshot()).resolves.toEqual({
      provider: 'postgres',
      pending: 2,
      processing: 2,
      failed: 2,
      staleProcessing: 0,
      reclaimCount: 0,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('keeps artifact lifecycle and its outbox event in one transaction', async () => {
    const { calls, pool } = createTransactionPool((sql) =>
      sql.includes('SELECT lifecycle_state')
        ? { rows: [{ lifecycle_state: 'agent-pass' }] }
        : { rows: [] },
    );
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.artifactWriter.updateLifecycle('artifact-1', 'approved', {
        actorId: 'reviewer-1',
      }),
    ).rejects.toThrow(/artifact .* not found/i);

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('UPDATE skill_artifacts'),
        expect.stringContaining('INSERT INTO artifact_lifecycle_events'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'COMMIT',
      ]),
    );
  });
});
