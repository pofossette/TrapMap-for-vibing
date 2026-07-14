import { describe, expect, it, vi } from 'vitest';

import {
  createKnowledgeWriteOutboxDiagnostics,
  createKnowledgeWriteOwnerBundle,
} from './pg-ports.js';

describe('knowledge-write PostgreSQL owner bundle', () => {
  it('keeps lifecycle state, lifecycle event, and outbox event in one transaction', async () => {
    const calls: Array<{ sql: string; client: object }> = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push({ sql, client });
        if (sql.includes('SELECT lifecycle_state')) {
          return { rows: [{ lifecycle_state: 'agent-pass' }] };
        }
        if (sql.includes('RETURNING *')) {
          return { rows: [{ id: 'entry-1', lifecycle_state: 'approved' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const owner = createKnowledgeWriteOwnerBundle({ connect: vi.fn(async () => client) } as never);

    await owner.knowledgeRepo.updateLifecycle('entry-1', 'approved', { actorId: 'reviewer-1' });

    expect(calls.map(({ sql }) => sql)).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('UPDATE knowledge_entries'),
        expect.stringContaining('INSERT INTO lifecycle_events'),
        expect.stringContaining('INSERT INTO domain_event_outbox'),
        'COMMIT',
      ]),
    );
    expect(new Set(calls.map(({ client: usedClient }) => usedClient))).toEqual(new Set([client]));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back the authoritative write when outbox persistence fails', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
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
      }),
      release: vi.fn(),
    };
    const owner = createKnowledgeWriteOwnerBundle({ connect: vi.fn(async () => client) } as never);

    await expect(
      owner.knowledgeRepo.updateLifecycle('entry-1', 'approved', { actorId: 'reviewer-1' }),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects an invalid lifecycle transition before persisting an outbox event', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('SELECT lifecycle_state')) {
          return { rows: [{ lifecycle_state: 'approved' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const owner = createKnowledgeWriteOwnerBundle({ connect: vi.fn(async () => client) } as never);

    await expect(
      owner.knowledgeRepo.updateLifecycle('entry-1', 'submitted', { actorId: 'reviewer-1' }),
    ).rejects.toThrow(/invalid lifecycle transition/i);

    expect(calls.some((sql) => sql.includes('UPDATE knowledge_entries'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO domain_event_outbox'))).toBe(false);
    expect(calls).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back without producing an outbox event for an unknown entry', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const owner = createKnowledgeWriteOwnerBundle({ connect: vi.fn(async () => client) } as never);

    await expect(
      owner.knowledgeRepo.updateLifecycle('missing-entry', 'approved', { actorId: 'reviewer-1' }),
    ).rejects.toThrow(/knowledge entry .* not found/i);

    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('INSERT INTO domain_event_outbox'))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('exposes a structural knowledge repository without host-owned concrete ports', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const owner = createKnowledgeWriteOwnerBundle({ query } as never);

    await owner.knowledgeRepo.insert({
      id: 'entry-system-admin',
      teamId: null,
      content: 'owner-local write probe',
      title: 'Owner-local probe',
      labels: ['closeout'],
      lifecycleState: 'submitted',
      ownerUserId: 'system-admin',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    } as never);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO knowledge_entries'), [
      'entry-system-admin',
      null,
      'global',
      JSON.stringify(['closeout']),
      'Owner-local probe',
      'owner-local write probe',
      0,
      'submitted',
      'system-admin',
      '2026-07-14T00:00:00.000Z',
      '2026-07-14T00:00:00.000Z',
    ]);
  });

  it('reads outbox diagnostics without acquiring job-runtime mutation capabilities', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: '2' }] }));
    const diagnostics = createKnowledgeWriteOutboxDiagnostics({ query } as never);

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
});
