import { describe, expect, it, vi } from 'vitest';

import {
  DatabaseOwnershipError,
  assertDatabaseWriteOwner,
  getDatabaseWriteOwner,
  withDatabaseWriteGuard,
} from './database-ownership.js';
import { createServicePorts } from './ports.js';

const identity = {
  auditLog: { record: async () => undefined, query: async () => ({ items: [], total: 0 }) },
};

describe('distributed database ownership guard', () => {
  it('accepts the declared owner for an authoritative table family', () => {
    expect(getDatabaseWriteOwner('knowledge')).toBe('knowledge-write');
    expect(() => assertDatabaseWriteOwner('knowledge-write', 'knowledge')).not.toThrow();
  });

  it('rejects cross-owner writes with an explainable error', () => {
    expect(() => assertDatabaseWriteOwner('governance-review', 'knowledge')).toThrow(
      DatabaseOwnershipError,
    );
    expect(() => assertDatabaseWriteOwner('governance-review', 'knowledge')).toThrow(
      /knowledge-write owns knowledge/i,
    );
  });

  it('guards repository mutation calls while preserving cross-owner reads', async () => {
    const repository = {
      getById: async () => ({ id: 'entry-1' }),
      insert: async () => undefined,
      updateStatus: async () => undefined,
    };
    const guarded = withDatabaseWriteGuard(repository, 'governance-review', 'knowledge');

    await expect(guarded.getById()).resolves.toEqual({ id: 'entry-1' });
    expect(() => guarded.insert()).toThrow(/knowledge-write owns knowledge/i);
    expect(() => guarded.updateStatus()).toThrow(/knowledge-write owns knowledge/i);
  });

  it('does not expose knowledge mutation through the distributed shared bundle', async () => {
    const ports = createServicePorts(
      { query: vi.fn(async () => ({ rows: [] })) } as never,
      'knowledge-write',
      identity,
    );

    expect(ports.repos.knowledge).not.toHaveProperty('insert');
  });

  it('keeps cross-owner audit repository writes behind the audit capability', () => {
    const ports = createServicePorts({} as never, 'knowledge-write', identity);

    expect(ports.repos.audit).toBeUndefined();
  });

  it('does not construct identity repositories in the distributed shared bundle', () => {
    const ports = createServicePorts({} as never, 'knowledge-write', identity);

    expect(ports.repos).not.toHaveProperty('session');
    expect(ports.repos).not.toHaveProperty('accessKey');
    expect(ports.repos).not.toHaveProperty('team');
    expect(ports.repos).not.toHaveProperty('membership');
    expect(ports.repos).not.toHaveProperty('user');
    expect(ports.repos).not.toHaveProperty('feedback');
  });

  it('does not expose job runtime mutation capabilities to business owners', () => {
    const ports = createServicePorts({} as never, 'knowledge-write', identity);

    expect(ports.jobRuntime).toBeUndefined();
    expect(ports.asyncDiagnostics).toEqual({
      task: expect.any(Object),
      outbox: expect.any(Object),
    });
    expect(ports.asyncDiagnostics.task).not.toHaveProperty('enqueue');
    expect(ports.asyncDiagnostics.outbox).not.toHaveProperty('enqueue');
  });

  it('exposes queue and outbox mutation capabilities only to job-runtime', () => {
    const ports = createServicePorts({} as never, 'job-runtime', identity);

    expect(ports.jobRuntime).toEqual({
      task: expect.any(Object),
      outbox: expect.any(Object),
    });
    expect(ports.jobRuntime?.task).toHaveProperty('enqueue');
    expect(ports.jobRuntime?.outbox).toHaveProperty('enqueue');
  });
});
