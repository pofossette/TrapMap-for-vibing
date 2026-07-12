import { describe, expect, it, vi } from 'vitest';

import { createServicePorts } from './ports.js';

describe('knowledge-write lifecycle persistence', () => {
  it('commits the authoritative lifecycle write and its outbox event on one client', async () => {
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
    const pool = { connect: vi.fn(async () => client) };
    const ports = createServicePorts(pool as never, 'knowledge-write');

    await ports.repos.knowledge.updateLifecycle('entry-1', 'approved', { actorId: 'reviewer-1' });

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

  it('rolls back and releases the client when outbox persistence fails', async () => {
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
    const pool = { connect: vi.fn(async () => client) };
    const ports = createServicePorts(pool as never, 'knowledge-write');

    await expect(
      ports.repos.knowledge.updateLifecycle('entry-1', 'approved', { actorId: 'reviewer-1' }),
    ).rejects.toThrow('outbox unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back without enqueueing when the authoritative entry is absent', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const ports = createServicePorts(pool as never, 'knowledge-write');

    await expect(
      ports.repos.knowledge.updateLifecycle('missing-entry', 'approved', { actorId: 'reviewer-1' }),
    ).rejects.toThrow(/knowledge entry not found/i);

    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('INSERT INTO domain_event_outbox'))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects an invalid locked-state transition before the authoritative write', async () => {
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
    const pool = { connect: vi.fn(async () => client) };
    const ports = createServicePorts(pool as never, 'knowledge-write');

    await expect(
      ports.repos.knowledge.updateLifecycle('entry-1', 'submitted', { actorId: 'reviewer-1' }),
    ).rejects.toThrow(/invalid lifecycle transition/i);

    expect(calls.some((sql) => sql.includes('UPDATE knowledge_entries'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO domain_event_outbox'))).toBe(false);
    expect(calls).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
