import { describe, expect, it, vi } from 'vitest';

import {
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
} from './pg-ports.js';
import { createTransactionPool } from './test-helpers.js';

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

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO knowledge_entries'),
        expect.stringContaining('INSERT INTO knowledge_revisions'),
        expect.stringContaining('INSERT INTO knowledge_labels'),
        expect.stringContaining('INSERT INTO lifecycle_events'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'COMMIT',
      ]),
    );
    expect(calls).not.toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back a maintenance decision when its outbox event cannot persist', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'approved' }] };
      }
      if (sql.includes('INSERT INTO domain_event_outbox')) {
        throw new Error('outbox unavailable');
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.applyMaintenanceDecision({
        entryId: 'entry-1',
        actorId: 'maintainer-1',
        action: 'refresh',
      }),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('UPDATE knowledge_entries SET maintenance_meta'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'ROLLBACK',
      ]),
    );
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back a decay decision when its outbox event cannot persist', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'approved' }] };
      }
      if (sql.includes('INSERT INTO domain_event_outbox')) {
        throw new Error('outbox unavailable');
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.applyDecayDecision({
        entryId: 'entry-1',
        actorId: 'decay-worker',
        action: 'suppress',
      }),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back review decisions when the lifecycle outbox cannot persist', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'agent-pass' }] };
      }
      if (sql.includes('RETURNING *')) {
        return { rows: [{ id: 'entry-1', lifecycle_state: 'approved' }] };
      }
      if (sql.includes('INSERT INTO domain_event_outbox')) {
        throw new Error('outbox unavailable');
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.approveReviewDecision({
        entryId: 'entry-1',
        actorId: 'reviewer-1',
        note: 'approved',
      }),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

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
          },
        ],
      })),
    } as never);

    const entry = await owner.knowledgeOwner.getById('entry-1');

    expect((entry as unknown as { decayMeta: unknown })?.decayMeta).toBeNull();
    expect((entry as unknown as { maintenanceMeta: unknown })?.maintenanceMeta).toBeNull();
    expect((entry as unknown as { requiredLevel: number })?.requiredLevel).toBe(2);
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

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('UPDATE knowledge_entries SET detail'),
        expect.stringContaining('INSERT INTO knowledge_revisions'),
        expect.stringContaining('DELETE FROM knowledge_labels'),
        expect.stringContaining('INSERT INTO knowledge_labels'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'COMMIT',
      ]),
    );
    expect(calls).not.toContain('ROLLBACK');
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

  it('rolls back a supersede when its lifecycle outbox event cannot persist', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('SELECT lifecycle_state')) {
        return { rows: [{ lifecycle_state: 'approved' }] };
      }
      if (sql.includes('INSERT INTO domain_event_outbox')) {
        throw new Error('outbox unavailable');
      }
      return { rows: [] };
    });
    const owner = createKnowledgeWriteOwnerBundle(pool as never);

    await expect(
      owner.knowledgeOwner.supersede('entry-1', 'replacement-1', 'editor-1'),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining("UPDATE knowledge_entries SET lifecycle_state = 'deactivated'"),
        expect.stringContaining('INSERT INTO knowledge_revisions'),
        expect.stringContaining('INSERT INTO lifecycle_events'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'ROLLBACK',
      ]),
    );
    expect(calls).not.toContain('COMMIT');
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
