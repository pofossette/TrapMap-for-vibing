/**
 * Tests for auth repository interfaces and InMemory implementations.
 *
 * Covers SessionRepository and AccessKeyRepository behavioral contracts.
 *
 * Phase: 83-01 (Store Decoupling)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import type { SkillShareerStore } from '../store.js';
import { hashSecret, nowIso } from '../store.js';
import {
  InMemoryAccessKeyRepository,
  InMemorySessionRepository,
  createAccessKeyRepository,
  createSessionRepository,
} from './index.js';

describe('SessionRepository', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-session-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    sessionRepo = new InMemorySessionRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('nextId', () => {
    it('generates ID with correct format', async () => {
      const id = await sessionRepo.nextId();

      expect(id).toMatch(/^session_\d+$/);
    });

    it('generates IDs that are unique when called inside transact', async () => {
      // nextId() uses snapshot() which doesn't persist counter changes.
      // In practice, nextId is called inside transact (e.g., in create()).
      // This test verifies the IDs are unique when properly used.

      // Create sessions which internally call nextId within transact
      const session1 = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_id_test_1',
        activeTeamId: 'team_id_test',
        tokenHash: hashSecret('token-id-1'),
        expiresAt: null,
      });

      const session2 = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_id_test_2',
        activeTeamId: 'team_id_test',
        tokenHash: hashSecret('token-id-2'),
        expiresAt: null,
      });

      // IDs should be unique
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('create', () => {
    it('creates a session with generated id and timestamps', async () => {
      const beforeCreate = new Date().toISOString();

      const session = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_1',
        activeTeamId: 'team_1',
        tokenHash: hashSecret('test-token-001'),
        expiresAt: null,
      });

      expect(session.id).toMatch(/^session_\d+$/);
      expect(session.subjectType).toBe('user');
      expect(session.userId).toBe('user_1');
      expect(session.activeTeamId).toBe('team_1');
      expect(session.tokenHash).toBe(hashSecret('test-token-001'));
      expect(session.expiresAt).toBeNull();
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.createdAt >= beforeCreate).toBe(true);
    });

    it('persists session to store', async () => {
      const session = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_2',
        activeTeamId: 'team_2',
        tokenHash: hashSecret('test-token-002'),
        expiresAt: null,
      });

      const data = await store.snapshot();
      const found = data.sessions.find((s) => s.id === session.id);
      expect(found).toBeDefined();
      expect(found?.userId).toBe('user_2');
    });

    it('creates system-admin session', async () => {
      const session = await sessionRepo.create({
        subjectType: 'system-admin',
        userId: null,
        activeTeamId: null,
        tokenHash: hashSecret('admin-token-001'),
        expiresAt: null,
      });

      expect(session.subjectType).toBe('system-admin');
      expect(session.userId).toBeNull();
      expect(session.activeTeamId).toBeNull();
    });
  });

  describe('getByTokenHash', () => {
    it('finds session by token hash', async () => {
      const tokenHash = hashSecret('findable-token-001');
      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_find',
        activeTeamId: 'team_find',
        tokenHash,
        expiresAt: null,
      });

      const found = await sessionRepo.getByTokenHash(tokenHash);

      expect(found).not.toBeNull();
      expect(found?.userId).toBe('user_find');
    });

    it('returns null for non-existent token hash', async () => {
      const found = await sessionRepo.getByTokenHash(hashSecret('nonexistent-token'));
      expect(found).toBeNull();
    });

    it('returns correct session when multiple exist', async () => {
      const targetHash = hashSecret('target-token');
      const otherHash = hashSecret('other-token');

      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_target',
        activeTeamId: 'team_target',
        tokenHash: targetHash,
        expiresAt: null,
      });

      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_other',
        activeTeamId: 'team_other',
        tokenHash: otherHash,
        expiresAt: null,
      });

      const found = await sessionRepo.getByTokenHash(targetHash);
      expect(found?.userId).toBe('user_target');
    });
  });

  describe('deleteByTokenHash', () => {
    it('deletes session by token hash', async () => {
      const tokenHash = hashSecret('deletable-token-001');
      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_delete',
        activeTeamId: 'team_delete',
        tokenHash,
        expiresAt: null,
      });

      await sessionRepo.deleteByTokenHash(tokenHash);

      const found = await sessionRepo.getByTokenHash(tokenHash);
      expect(found).toBeNull();
    });

    it('does not throw for non-existent token hash', async () => {
      // Should not throw
      await expect(
        sessionRepo.deleteByTokenHash(hashSecret('nonexistent')),
      ).resolves.toBeUndefined();
    });

    it('only deletes targeted session', async () => {
      const keepHash = hashSecret('keep-token');
      const deleteHash = hashSecret('delete-token');

      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_keep',
        activeTeamId: 'team_keep',
        tokenHash: keepHash,
        expiresAt: null,
      });

      await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_delete',
        activeTeamId: 'team_delete',
        tokenHash: deleteHash,
        expiresAt: null,
      });

      await sessionRepo.deleteByTokenHash(deleteHash);

      const kept = await sessionRepo.getByTokenHash(keepHash);
      expect(kept).not.toBeNull();
      expect(kept?.userId).toBe('user_keep');
    });
  });

  describe('updateActiveTeam', () => {
    it('updates activeTeamId for existing session', async () => {
      const session = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_update',
        activeTeamId: 'team_original',
        tokenHash: hashSecret('update-token-001'),
        expiresAt: null,
      });

      const updated = await sessionRepo.updateActiveTeam(session.id, 'team_new');

      expect(updated.activeTeamId).toBe('team_new');
      expect(updated.updatedAt >= session.updatedAt).toBe(true);
    });

    it('persists update to store', async () => {
      const session = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_update2',
        activeTeamId: 'team_original2',
        tokenHash: hashSecret('update-token-002'),
        expiresAt: null,
      });

      await sessionRepo.updateActiveTeam(session.id, 'team_persisted');

      const data = await store.snapshot();
      const found = data.sessions.find((s) => s.id === session.id);
      expect(found?.activeTeamId).toBe('team_persisted');
    });

    it('throws error for non-existent session', async () => {
      await expect(sessionRepo.updateActiveTeam('session_nonexistent', 'team_new')).rejects.toThrow(
        'Session session_nonexistent not found',
      );
    });

    it('can set activeTeamId to null', async () => {
      const session = await sessionRepo.create({
        subjectType: 'user',
        userId: 'user_null',
        activeTeamId: 'team_to_null',
        tokenHash: hashSecret('null-token-001'),
        expiresAt: null,
      });

      const updated = await sessionRepo.updateActiveTeam(session.id, null);

      expect(updated.activeTeamId).toBeNull();
    });
  });
});

describe('AccessKeyRepository', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let accessKeyRepo: InMemoryAccessKeyRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-accesskey-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    accessKeyRepo = new InMemoryAccessKeyRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('insert', () => {
    it('inserts an access key', async () => {
      const key = {
        id: 'ak_insert_1',
        memberId: 'membership_1',
        tokenHash: hashSecret('insert-key-001'),
        tokenPreview: 'key-001',
        issuedByUserId: 'user_1',
        teamId: 'team_1',
        level: 10,
        notes: null,
        revokedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await accessKeyRepo.insert(key);

      const data = await store.snapshot();
      const found = data.accessKeys.find((k) => k.id === 'ak_insert_1');
      expect(found).toBeDefined();
      expect(found?.memberId).toBe('membership_1');
    });
  });

  describe('getByTokenHash', () => {
    it('finds access key by token hash', async () => {
      const tokenHash = hashSecret('find-ak-001');
      await store.transact((data) => {
        data.accessKeys.push({
          id: 'ak_find_1',
          memberId: 'membership_find',
          tokenHash,
          tokenPreview: 'ak-find',
          issuedByUserId: 'user_find',
          teamId: 'team_find',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await accessKeyRepo.getByTokenHash(tokenHash);

      expect(found).not.toBeNull();
      expect(found?.id).toBe('ak_find_1');
    });

    it('returns null for non-existent token hash', async () => {
      const found = await accessKeyRepo.getByTokenHash(hashSecret('nonexistent-ak'));
      expect(found).toBeNull();
    });
  });

  describe('getById', () => {
    it('finds access key by id', async () => {
      await store.transact((data) => {
        data.accessKeys.push({
          id: 'ak_getbyid_1',
          memberId: 'membership_getbyid',
          tokenHash: hashSecret('getbyid-ak-001'),
          tokenPreview: 'ak-getbyid',
          issuedByUserId: 'user_getbyid',
          teamId: 'team_getbyid',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await accessKeyRepo.getById('ak_getbyid_1');

      expect(found).not.toBeNull();
      expect(found?.memberId).toBe('membership_getbyid');
    });

    it('returns null for non-existent id', async () => {
      const found = await accessKeyRepo.getById('ak_nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('revoke', () => {
    it('sets revokedAt timestamp', async () => {
      await store.transact((data) => {
        data.accessKeys.push({
          id: 'ak_revoke_1',
          memberId: 'membership_revoke',
          tokenHash: hashSecret('revoke-ak-001'),
          tokenPreview: 'ak-revoke',
          issuedByUserId: 'user_revoke',
          teamId: 'team_revoke',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await accessKeyRepo.revoke('ak_revoke_1');

      const data = await store.snapshot();
      const found = data.accessKeys.find((k) => k.id === 'ak_revoke_1');
      expect(found?.revokedAt).not.toBeNull();
    });

    it('does not throw for non-existent id', async () => {
      // Should not throw
      await expect(accessKeyRepo.revoke('ak_nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('listByMember', () => {
    it('lists all access keys for a member', async () => {
      await store.transact((data) => {
        data.accessKeys.push({
          id: 'ak_list_1',
          memberId: 'membership_list',
          tokenHash: hashSecret('list-ak-001'),
          tokenPreview: 'ak-list-1',
          issuedByUserId: 'user_list',
          teamId: 'team_list',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.accessKeys.push({
          id: 'ak_list_2',
          memberId: 'membership_list',
          tokenHash: hashSecret('list-ak-002'),
          tokenPreview: 'ak-list-2',
          issuedByUserId: 'user_list',
          teamId: 'team_list',
          level: 5,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.accessKeys.push({
          id: 'ak_list_other',
          memberId: 'membership_other',
          tokenHash: hashSecret('list-ak-other'),
          tokenPreview: 'ak-other',
          issuedByUserId: 'user_other',
          teamId: 'team_other',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const keys = await accessKeyRepo.listByMember('membership_list');

      expect(keys).toHaveLength(2);
      expect(keys.map((k) => k.id).sort()).toEqual(['ak_list_1', 'ak_list_2']);
    });

    it('returns empty array for member with no keys', async () => {
      const keys = await accessKeyRepo.listByMember('membership_nokeys');
      expect(keys).toEqual([]);
    });
  });
});

describe('Repository factory functions', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-repo-factory-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('createSessionRepository returns InMemorySessionRepository', () => {
    const repo = createSessionRepository({ store });
    expect(repo).toBeInstanceOf(InMemorySessionRepository);
  });

  it('createAccessKeyRepository returns InMemoryAccessKeyRepository', () => {
    const repo = createAccessKeyRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryAccessKeyRepository);
  });

  it('factory accepts optional pool parameter (for future Pg support)', () => {
    // Should not throw - pool is optional and currently ignored
    const sessionRepo = createSessionRepository({ pool: undefined, store });
    const accessKeyRepo = createAccessKeyRepository({ pool: undefined, store });

    expect(sessionRepo).toBeInstanceOf(InMemorySessionRepository);
    expect(accessKeyRepo).toBeInstanceOf(InMemoryAccessKeyRepository);
  });
});
