/**
 * Tests for UserRepository interface and InMemory implementation.
 *
 * Phase: 83-03 (Store Decoupling)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import type { SkillShareerStore } from '../store.js';
import { nowIso } from '../store.js';
import { InMemoryUserRepository, createUserRepository } from './index.js';

describe('UserRepository', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let userRepo: InMemoryUserRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-user-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    userRepo = new InMemoryUserRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('nextId', () => {
    it('generates ID with correct format', async () => {
      const id = await userRepo.nextId();

      expect(id).toMatch(/^user_\d+$/);
    });

    it('returns incrementing IDs within same snapshot', async () => {
      // Verify that within a single snapshot view, IDs increment
      const data = await store.snapshot();

      const id1 = store.nextId(data, 'user');
      const id2 = store.nextId(data, 'user');

      expect(id1).toMatch(/^user_\d+$/);
      expect(id2).toMatch(/^user_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('insert', () => {
    it('inserts a user', async () => {
      const user = {
        id: 'user_insert_1',
        handle: 'insertuser',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await userRepo.insert(user);

      const data = await store.snapshot();
      const found = data.users.find((u) => u.id === 'user_insert_1');
      expect(found).toBeDefined();
      expect(found?.handle).toBe('insertuser');
    });

    it('can insert user with notes', async () => {
      const user = {
        id: 'user_notes_1',
        handle: 'notesuser',
        notes: 'Test user with notes',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await userRepo.insert(user);

      const found = await userRepo.getById('user_notes_1');
      expect(found?.notes).toBe('Test user with notes');
    });
  });

  describe('getById', () => {
    it('finds user by id', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_getbyid_1',
          handle: 'getbyiduser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await userRepo.getById('user_getbyid_1');

      expect(found).not.toBeNull();
      expect(found?.handle).toBe('getbyiduser');
    });

    it('returns null for non-existent id', async () => {
      const found = await userRepo.getById('user_nonexistent');
      expect(found).toBeNull();
    });

    it('returns correct user when multiple exist', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_multi_1',
          handle: 'multiuser1',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.users.push({
          id: 'user_multi_2',
          handle: 'multiuser2',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await userRepo.getById('user_multi_2');
      expect(found?.handle).toBe('multiuser2');
    });
  });

  describe('getByHandle', () => {
    it('finds user by handle', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_handle_1',
          handle: 'handleuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await userRepo.getByHandle('handleuser');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('user_handle_1');
    });

    it('returns null for non-existent handle', async () => {
      const found = await userRepo.getByHandle('nonexistent_handle');
      expect(found).toBeNull();
    });

    it('is case-sensitive', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_case_1',
          handle: 'CaseUser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const foundUpper = await userRepo.getByHandle('CaseUser');
      const foundLower = await userRepo.getByHandle('caseuser');

      expect(foundUpper?.id).toBe('user_case_1');
      expect(foundLower).toBeNull();
    });
  });

  describe('update', () => {
    it('updates user fields', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_update_1',
          handle: 'updateuser',
          notes: 'Original notes',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await userRepo.update('user_update_1', { notes: 'Updated notes' });

      const found = await userRepo.getById('user_update_1');
      expect(found?.notes).toBe('Updated notes');
      expect(found?.handle).toBe('updateuser'); // Unchanged
    });

    it('updates updatedAt timestamp', async () => {
      const originalTime = nowIso();
      await store.transact((data) => {
        data.users.push({
          id: 'user_timestamp_1',
          handle: 'timestampuser',
          notes: null,
          createdAt: originalTime,
          updatedAt: originalTime,
        });
      });

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await userRepo.update('user_timestamp_1', { notes: 'New notes' });

      const found = await userRepo.getById('user_timestamp_1');
      expect(found?.updatedAt > originalTime).toBe(true);
    });

    it('does not throw for non-existent user (silent no-op)', async () => {
      // Current implementation silently ignores non-existent users
      await expect(userRepo.update('user_nonexistent', { notes: 'test' })).resolves.toBeUndefined();
    });

    it('can update multiple fields at once', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_multi_update',
          handle: 'multiupdateuser',
          notes: 'Original',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await userRepo.update('user_multi_update', {
        handle: 'newhandle',
        notes: 'New notes',
      });

      const found = await userRepo.getById('user_multi_update');
      expect(found?.handle).toBe('newhandle');
      expect(found?.notes).toBe('New notes');
    });
  });
});

describe('createUserRepository factory', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-user-factory-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns InMemoryUserRepository', () => {
    const repo = createUserRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryUserRepository);
  });

  it('accepts optional pool parameter (for future Pg support)', () => {
    // Should not throw - pool is optional and currently ignored
    const repo = createUserRepository({ pool: undefined, store });
    expect(repo).toBeInstanceOf(InMemoryUserRepository);
  });
});
