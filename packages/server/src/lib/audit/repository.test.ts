import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createEmptyStoreData } from '@trapmap/server/lib/store.js';
import type { AuditEventRecord } from '@trapmap/server/lib/store.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AuditRepository,
  InMemoryAuditRepository,
  createAuditRepository,
} from './repository.js';

// Create a unique temp directory for each test run
const testRunId = `audit-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const tempDir = join(tmpdir(), testRunId);
mkdirSync(tempDir, { recursive: true });

function getUniqueStorePath(name: string): string {
  return join(tempDir, `${name}-${Date.now()}.json`);
}

/**
 * Helper to create a test audit event with predictable data.
 */
function createTestAuditEvent(overrides: Partial<AuditEventRecord> = {}): AuditEventRecord {
  return {
    id: 'audit_1',
    teamId: 'team_1',
    actorId: 'user_1',
    action: 'knowledge:submit',
    entityId: 'entry_1',
    payload: { detail: 'test' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InMemoryAuditRepository', () => {
  let store: JsonStore;
  let repo: AuditRepository;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('inmem');
    store = new JsonStore(storePath);
    // Initialize empty store
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
    repo = new InMemoryAuditRepository(store);
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('insert() makes the event retrievable via getById()', async () => {
    const event = createTestAuditEvent();

    await repo.insert(event);

    const found = await repo.getById('audit_1');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('audit_1');
    expect(found?.action).toBe('knowledge:submit');
    expect(found?.actorId).toBe('user_1');
  });

  it('getById() returns null for nonexistent id', async () => {
    const found = await repo.getById('nonexistent');
    expect(found).toBeNull();
  });

  it('listByFilter() filters by action array', async () => {
    const event1 = createTestAuditEvent({ id: 'audit_1', action: 'knowledge:submit' });
    const event2 = createTestAuditEvent({ id: 'audit_2', action: 'knowledge:approve' });
    const event3 = createTestAuditEvent({ id: 'audit_3', action: 'knowledge:submit' });

    await repo.insert(event1);
    await repo.insert(event2);
    await repo.insert(event3);

    const results = await repo.listByFilter({ action: ['knowledge:submit'] });
    expect(results.items).toHaveLength(2);
    expect(results.items.map((e) => e.id).sort()).toEqual(['audit_1', 'audit_3']);
    expect(results.total).toBe(2);
  });

  it('listByFilter() filters by actorId', async () => {
    const event1 = createTestAuditEvent({ id: 'audit_1', actorId: 'user_1' });
    const event2 = createTestAuditEvent({ id: 'audit_2', actorId: 'user_2' });
    const event3 = createTestAuditEvent({ id: 'audit_3', actorId: 'user_1' });

    await repo.insert(event1);
    await repo.insert(event2);
    await repo.insert(event3);

    const results = await repo.listByFilter({ actorId: 'user_1' });
    expect(results.items).toHaveLength(2);
    expect(results.items.map((e) => e.id).sort()).toEqual(['audit_1', 'audit_3']);
  });

  it('listByFilter() filters by teamId', async () => {
    const event1 = createTestAuditEvent({ id: 'audit_1', teamId: 'team_1' });
    const event2 = createTestAuditEvent({ id: 'audit_2', teamId: 'team_2' });
    const event3 = createTestAuditEvent({ id: 'audit_3', teamId: 'team_1' });

    await repo.insert(event1);
    await repo.insert(event2);
    await repo.insert(event3);

    const results = await repo.listByFilter({ teamId: 'team_1' });
    expect(results.items).toHaveLength(2);
    expect(results.items.map((e) => e.id).sort()).toEqual(['audit_1', 'audit_3']);
  });

  it('listByFilter() filters by operation, trace, and causation ids', async () => {
    await repo.insert(
      createTestAuditEvent({
        id: 'audit-correlation',
        operationId: 'operation-1',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        causationId: 'event-1',
      }),
    );
    await repo.insert(
      createTestAuditEvent({
        id: 'audit-other',
        operationId: 'operation-2',
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        causationId: 'event-2',
      }),
    );

    const results = await repo.listByFilter({
      operationId: 'operation-1',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      causationId: 'event-1',
    });

    expect(results.items.map((event) => event.id)).toEqual(['audit-correlation']);
  });

  it('listByFilter() filters by date range', async () => {
    const event1 = createTestAuditEvent({
      id: 'audit_1',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const event2 = createTestAuditEvent({
      id: 'audit_2',
      createdAt: '2026-06-01T00:00:00Z',
    });
    const event3 = createTestAuditEvent({
      id: 'audit_3',
      createdAt: '2026-03-01T00:00:00Z',
    });

    await repo.insert(event1);
    await repo.insert(event2);
    await repo.insert(event3);

    const results = await repo.listByFilter({
      from: '2026-02-01T00:00:00Z',
      to: '2026-04-01T00:00:00Z',
    });
    expect(results.items).toHaveLength(1);
    expect(results.items[0]?.id).toBe('audit_3');
  });

  it('listByFilter() respects limit and returns total count', async () => {
    // Insert 30 events
    for (let i = 1; i <= 30; i++) {
      await repo.insert(
        createTestAuditEvent({
          id: `audit_${i}`,
          createdAt: new Date(Date.now() + i * 1000).toISOString(),
        }),
      );
    }

    // Default limit is 25
    const results1 = await repo.listByFilter({});
    expect(results1.items).toHaveLength(25);
    expect(results1.total).toBe(30);

    // Custom limit
    const results2 = await repo.listByFilter({ limit: 10 });
    expect(results2.items).toHaveLength(10);
    expect(results2.total).toBe(30);
  });

  it('listByFilter() returns results sorted by createdAt descending', async () => {
    const event1 = createTestAuditEvent({
      id: 'audit_1',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const event2 = createTestAuditEvent({
      id: 'audit_2',
      createdAt: '2026-06-01T00:00:00Z',
    });
    const event3 = createTestAuditEvent({
      id: 'audit_3',
      createdAt: '2026-03-01T00:00:00Z',
    });

    await repo.insert(event1);
    await repo.insert(event2);
    await repo.insert(event3);

    const results = await repo.listByFilter({});
    expect(results.items[0]?.id).toBe('audit_2');
    expect(results.items[1]?.id).toBe('audit_3');
    expect(results.items[2]?.id).toBe('audit_1');
  });

  it('nextId() returns a string', async () => {
    const id = await repo.nextId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^audit_/);
  });
});

describe('createAuditRepository factory', () => {
  let store: JsonStore;
  let storePath: string;

  beforeEach(() => {
    storePath = getUniqueStorePath('factory');
    store = new JsonStore(storePath);
    store.transact((d) => {
      Object.assign(d, createEmptyStoreData());
    });
  });

  afterEach(() => {
    if (existsSync(storePath)) {
      unlinkSync(storePath);
    }
  });

  it('returns InMemoryAuditRepository when pool is undefined', () => {
    const repo = createAuditRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryAuditRepository);
  });
});
