/**
 * Tests for session.ts repository-based operations.
 *
 * Tests createSession, deleteSession, findSessionByToken, and findAccessKeyByToken
 * using both repository and store-based approaches.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { InMemoryAccessKeyRepository, InMemorySessionRepository } from './auth/index.js';
import { buildServer } from '../app.js';
import type { SkillShareerStore } from './store.js';
import {
  createSession,
  deleteSession,
  findAccessKeyByToken,
  findSessionByToken,
} from './session.js';
import { hashSecret, nowIso } from './store.js';

describe('session.ts repository operations', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionRepo: InMemorySessionRepository;
  let accessKeyRepo: InMemoryAccessKeyRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-session-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    sessionRepo = new InMemorySessionRepository(store);
    accessKeyRepo = new InMemoryAccessKeyRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('createSession with SessionRepository', () => {
    it('creates session via repository and returns token', async () => {
      const { record, token } = await createSession(
        sessionRepo,
        'user',
        'user_1',
        'team_1',
      );

      expect(record.id).toBeDefined();
      expect(record.subjectType).toBe('user');
      expect(record.userId).toBe('user_1');
      expect(record.activeTeamId).toBe('team_1');
      expect(record.tokenHash).toBe(hashSecret(token));
      expect(record.createdAt).toBeDefined();
      expect(record.updatedAt).toBeDefined();
    });

    it('creates system-admin session via repository', async () => {
      const { record, token } = await createSession(
        sessionRepo,
        'system-admin',
        null,
        null,
      );

      expect(record.subjectType).toBe('system-admin');
      expect(record.userId).toBeNull();
      expect(record.activeTeamId).toBeNull();
      expect(token).toMatch(/^ssr_sess_/);
    });

    it('creates session via store fallback (backward compatibility)', async () => {
      const { record, token } = await createSession(
        store,
        'user',
        'user_fallback',
        'team_fallback',
      );

      expect(record.id).toBeDefined();
      expect(record.userId).toBe('user_fallback');
      expect(record.tokenHash).toBe(hashSecret(token));
    });
  });

  describe('deleteSession with SessionRepository', () => {
    it('deletes session via repository', async () => {
      const { record, token } = await createSession(sessionRepo, 'user', 'user_1', 'team_1');

      // Verify session exists
      const foundBefore = await sessionRepo.getByTokenHash(hashSecret(token));
      expect(foundBefore).not.toBeNull();

      // Delete
      await deleteSession(sessionRepo, token);

      // Verify deleted
      const foundAfter = await sessionRepo.getByTokenHash(hashSecret(token));
      expect(foundAfter).toBeNull();
    });

    it('deletes session via store fallback (backward compatibility)', async () => {
      const { token } = await createSession(store, 'user', 'user_1', 'team_1');

      // Verify session exists
      const dataBefore = await store.snapshot();
      const foundBefore = dataBefore.sessions.find(s => s.tokenHash === hashSecret(token));
      expect(foundBefore).toBeDefined();

      // Delete
      await deleteSession(store, token);

      // Verify deleted
      const dataAfter = await store.snapshot();
      const foundAfter = dataAfter.sessions.find(s => s.tokenHash === hashSecret(token));
      expect(foundAfter).toBeUndefined();
    });
  });

  describe('findSessionByToken', () => {
    it('finds session via repository', async () => {
      const { record, token } = await createSession(sessionRepo, 'user', 'user_1', 'team_1');

      const found = await findSessionByToken(sessionRepo, token);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(record.id);
      expect(found?.userId).toBe('user_1');
    });

    it('returns null for non-existent token via repository', async () => {
      const found = await findSessionByToken(sessionRepo, 'nonexistent_token');
      expect(found).toBeNull();
    });

    it('finds session via store fallback', async () => {
      const { record, token } = await createSession(store, 'user', 'user_2', 'team_2');

      const found = await findSessionByToken(store, token);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(record.id);
    });

    it('returns null for non-existent token via store', async () => {
      const found = await findSessionByToken(store, 'nonexistent_token');
      expect(found).toBeNull();
    });
  });

  describe('findAccessKeyByToken', () => {
    it('finds access key via repository', async () => {
      const plainToken = 'test-access-key-repo-001';
      const tokenHash = hashSecret(plainToken);

      // Create test data
      await store.transact(async (data) => {
        data.users.push({
          id: 'user_ak_repo',
          handle: 'akuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_ak_repo',
          name: 'AK Repo Team',
          slug: 'ak-repo-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_ak_repo',
          userId: 'user_ak_repo',
          teamId: 'team_ak_repo',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.accessKeys.push({
          id: 'ak_repo_1',
          memberId: 'membership_ak_repo',
          tokenHash,
          tokenPreview: plainToken.slice(-8),
          issuedByUserId: 'user_ak_repo',
          teamId: 'team_ak_repo',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await findAccessKeyByToken(accessKeyRepo, plainToken);

      expect(found).not.toBeNull();
      expect(found?.id).toBe('ak_repo_1');
      expect(found?.memberId).toBe('membership_ak_repo');
    });

    it('returns null for revoked key via repository', async () => {
      const plainToken = 'test-access-key-revoked';
      const tokenHash = hashSecret(plainToken);

      await store.transact(async (data) => {
        data.accessKeys.push({
          id: 'ak_revoked',
          memberId: 'membership_1',
          tokenHash,
          tokenPreview: plainToken.slice(-8),
          issuedByUserId: 'user_1',
          teamId: 'team_1',
          level: 10,
          notes: null,
          revokedAt: nowIso(), // Revoked
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await findAccessKeyByToken(accessKeyRepo, plainToken);
      expect(found).toBeNull();
    });

    it('finds access key via StoreData fallback', async () => {
      const plainToken = 'test-access-key-store-001';
      const tokenHash = hashSecret(plainToken);

      await store.transact(async (data) => {
        data.accessKeys.push({
          id: 'ak_store_1',
          memberId: 'membership_store',
          tokenHash,
          tokenPreview: plainToken.slice(-8),
          issuedByUserId: 'user_store',
          teamId: 'team_store',
          level: 10,
          notes: null,
          revokedAt: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const data = await store.snapshot();
      const found = await findAccessKeyByToken(data, plainToken);

      expect(found).not.toBeNull();
      expect(found?.id).toBe('ak_store_1');
    });

    it('returns null for non-existent key via StoreData', async () => {
      const data = await store.snapshot();
      const found = await findAccessKeyByToken(data, 'nonexistent_key');
      expect(found).toBeNull();
    });
  });
});
