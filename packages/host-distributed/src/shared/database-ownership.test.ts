import { describe, expect, it } from 'vitest';

import {
  DatabaseOwnershipError,
  assertDatabaseWriteOwner,
  getDatabaseWriteOwner,
  withDatabaseWriteGuard,
} from './database-ownership.js';
import { createServicePorts } from './ports.js';

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

  it('keeps cross-owner audit repository writes behind the audit capability', () => {
    const ports = createServicePorts({} as never, 'knowledge-write');

    expect(ports.repos.audit).toBeUndefined();
  });

  it('does not expose job runtime mutation capabilities to business owners', () => {
    const ports = createServicePorts({} as never, 'knowledge-write');

    expect(ports.jobRuntime).toBeUndefined();
    expect(ports.asyncDiagnostics).toEqual({
      task: expect.any(Object),
      outbox: expect.any(Object),
    });
    expect(ports.asyncDiagnostics.task).not.toHaveProperty('enqueue');
    expect(ports.asyncDiagnostics.outbox).not.toHaveProperty('enqueue');
  });

  it('exposes queue and outbox mutation capabilities only to job-runtime', () => {
    const ports = createServicePorts({} as never, 'job-runtime');

    expect(ports.jobRuntime).toEqual({
      task: expect.any(Object),
      outbox: expect.any(Object),
    });
    expect(ports.jobRuntime?.task).toHaveProperty('enqueue');
    expect(ports.jobRuntime?.outbox).toHaveProperty('enqueue');
  });
});
