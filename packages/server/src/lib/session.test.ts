/**
 * Tests for session.ts repository-based operations.
 *
 * Tests createSession, deleteSession, findSessionByToken, and findAccessKeyByToken
 * using both repository and store-based approaches.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import {
  InMemoryAccessKeyRepository,
  InMemorySessionRepository,
} from './auth/index.js';
import {
  InMemoryMembershipRepository,
  InMemoryTeamRepository,
} from './teams/index.js';
import { InMemoryUserRepository } from './users/index.js';
import {
  createSession,
  deleteSession,
  findAccessKeyByToken,
  findSessionByToken,
  getSessionResponse,
  getSessionStatus,
  resolveAuthContext,
} from './session.js';
import type { SkillShareerStore } from './store.js';
import { hashSecret, nowIso } from './store.js';
import type { SkillShareerServices } from './context.js';

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
      const { record, token } = await createSession(sessionRepo, 'user', 'user_1', 'team_1');

      expect(record.id).toBeDefined();
      expect(record.subjectType).toBe('user');
      expect(record.userId).toBe('user_1');
      expect(record.activeTeamId).toBe('team_1');
      expect(record.tokenHash).toBe(hashSecret(token));
      expect(record.createdAt).toBeDefined();
      expect(record.updatedAt).toBeDefined();
    });

    it('creates system-admin session via repository', async () => {
      const { record, token } = await createSession(sessionRepo, 'system-admin', null, null);

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
      const foundBefore = dataBefore.sessions.find((s) => s.tokenHash === hashSecret(token));
      expect(foundBefore).toBeDefined();

      // Delete
      await deleteSession(store, token);

      // Verify deleted
      const dataAfter = await store.snapshot();
      const foundAfter = dataAfter.sessions.find((s) => s.tokenHash === hashSecret(token));
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

/**
 * Tests for resolveAuthContext, getSessionResponse, getSessionStatus
 * using repository-based code paths (Phase 83-04).
 */
describe('session.ts repository-based auth context resolution', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let sessionRepo: InMemorySessionRepository;
  let accessKeyRepo: InMemoryAccessKeyRepository;
  let userRepo: InMemoryUserRepository;
  let teamRepo: InMemoryTeamRepository;
  let membershipRepo: InMemoryMembershipRepository;

  // Helper to create services with all repos
  function createServicesWithRepos(): SkillShareerServices {
    return {
      config: app.skillShareer.config,
      store,
      indexAdapters: [],
      ai: app.skillShareer.ai,
      knowledgeRepo: undefined,
      artifactRepo: undefined,
      sessionRepo,
      accessKeyRepo,
      userRepo,
      teamRepo,
      membershipRepo,
    };
  }

  // Helper to create services without repos (store fallback)
  function createServicesWithoutRepos(): SkillShareerServices {
    return {
      config: app.skillShareer.config,
      store,
      indexAdapters: [],
      ai: app.skillShareer.ai,
      knowledgeRepo: undefined,
      artifactRepo: undefined,
      sessionRepo: undefined,
      accessKeyRepo: undefined,
      userRepo: undefined,
      teamRepo: undefined,
      membershipRepo: undefined,
    };
  }

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-auth-context-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    sessionRepo = new InMemorySessionRepository(store);
    accessKeyRepo = new InMemoryAccessKeyRepository(store);
    userRepo = new InMemoryUserRepository(store);
    teamRepo = new InMemoryTeamRepository(store);
    membershipRepo = new InMemoryMembershipRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('resolveAuthContext with repositories', () => {
    it('resolves user context via repositories', async () => {
      // Setup test data
      await store.transact((data) => {
        data.users.push({
          id: 'user_resolve_1',
          handle: 'resolveuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_resolve_1',
          name: 'Resolve Team',
          slug: 'resolve-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_resolve_1',
          userId: 'user_resolve_1',
          teamId: 'team_resolve_1',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Create session via repo
      const { token } = await createSession(sessionRepo, 'user', 'user_resolve_1', 'team_resolve_1');

      // Mock request with authorization header
      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithRepos();
      const authContext = await resolveAuthContext(services, mockRequest);

      expect(authContext.subjectType).toBe('user');
      expect(authContext.actorId).toBe('user_resolve_1');
      expect(authContext.handle).toBe('resolveuser');
      expect(authContext.activeTeamId).toBe('team_resolve_1');
      expect(authContext.user).not.toBeNull();
      expect(authContext.user?.handle).toBe('resolveuser');
      expect(authContext.membership).not.toBeNull();
      expect(authContext.membership?.teamId).toBe('team_resolve_1');
      expect(authContext.team).not.toBeNull();
      expect(authContext.team?.slug).toBe('resolve-team');
    });

    it('resolves system-admin context via repositories', async () => {
      const { token } = await createSession(sessionRepo, 'system-admin', null, null);

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithRepos();
      const authContext = await resolveAuthContext(services, mockRequest);

      expect(authContext.subjectType).toBe('system-admin');
      expect(authContext.actorId).toBe('system-admin');
      expect(authContext.handle).toBe('system-admin');
      expect(authContext.user).toBeNull();
      expect(authContext.membership).toBeNull();
    });

    it('resolves system-admin with active team via repositories', async () => {
      // Setup team
      await store.transact((data) => {
        data.teams.push({
          id: 'team_sa_active',
          name: 'SA Active Team',
          slug: 'sa-active-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const { token } = await createSession(sessionRepo, 'system-admin', null, 'team_sa_active');

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithRepos();
      const authContext = await resolveAuthContext(services, mockRequest);

      expect(authContext.subjectType).toBe('system-admin');
      expect(authContext.activeTeamId).toBe('team_sa_active');
      expect(authContext.team).not.toBeNull();
      expect(authContext.team?.id).toBe('team_sa_active');
    });

    it('throws 401 for invalid token via repositories', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid_token_12345',
        },
      } as any;

      const services = createServicesWithRepos();

      await expect(resolveAuthContext(services, mockRequest)).rejects.toThrow('Session not found');
    });

    it('falls back to store when repos are undefined', async () => {
      // Setup test data directly in store
      await store.transact((data) => {
        data.users.push({
          id: 'user_fallback_resolve',
          handle: 'fallbackuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_fallback_resolve',
          name: 'Fallback Team',
          slug: 'fallback-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_fallback_resolve',
          userId: 'user_fallback_resolve',
          teamId: 'team_fallback_resolve',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      // Create session via store (fallback)
      const { token } = await createSession(store, 'user', 'user_fallback_resolve', 'team_fallback_resolve');

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithoutRepos();
      const authContext = await resolveAuthContext(services, mockRequest);

      expect(authContext.subjectType).toBe('user');
      expect(authContext.actorId).toBe('user_fallback_resolve');
      expect(authContext.handle).toBe('fallbackuser');
    });
  });

  describe('getSessionResponse with repositories', () => {
    it('returns session response for user session via repositories', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_response_1',
          handle: 'responseuser',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_response_1',
          name: 'Response Team',
          slug: 'response-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_response_1',
          userId: 'user_response_1',
          teamId: 'team_response_1',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const { record } = await createSession(sessionRepo, 'user', 'user_response_1', 'team_response_1');

      const services = createServicesWithRepos();
      const response = await getSessionResponse(services, record);

      expect(response.sessionId).toBe(record.id);
      expect(response.member).toBeDefined();
      expect(response.member.handle).toBe('responseuser');
      expect(response.activeTeam).toBeDefined();
      expect(response.activeTeam?.id).toBe('team_response_1');
      expect(response.effectivePermissions).toBeDefined();
    });

    it('returns session response for system-admin via repositories', async () => {
      const { record } = await createSession(sessionRepo, 'system-admin', null, null);

      const services = createServicesWithRepos();
      const response = await getSessionResponse(services, record);

      expect(response.sessionId).toBe(record.id);
      expect(response.member.roleTemplate).toBe('system-admin');
      expect(response.member.isSystem).toBe(true);
      expect(response.activeTeam).toBeNull();
    });

    it('falls back to store when repos are undefined', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_response_fallback',
          handle: 'responsefallback',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_response_fallback',
          name: 'Response Fallback Team',
          slug: 'response-fallback-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_response_fallback',
          userId: 'user_response_fallback',
          teamId: 'team_response_fallback',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const { record } = await createSession(store, 'user', 'user_response_fallback', 'team_response_fallback');

      const services = createServicesWithoutRepos();
      const response = await getSessionResponse(services, record);

      expect(response.sessionId).toBe(record.id);
      expect(response.member.handle).toBe('responsefallback');
    });
  });

  describe('getSessionStatus with repositories', () => {
    it('returns session status via sessionRepo', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_status_1',
          handle: 'statususer',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_status_1',
          name: 'Status Team',
          slug: 'status-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_status_1',
          userId: 'user_status_1',
          teamId: 'team_status_1',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const { token } = await createSession(sessionRepo, 'user', 'user_status_1', 'team_status_1');

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithRepos();
      const status = await getSessionStatus(services, mockRequest);

      expect(status).not.toBeNull();
      expect(status?.sessionId).toBeDefined();
      expect(status?.member.handle).toBe('statususer');
    });

    it('returns null when no token provided', async () => {
      const mockRequest = {
        headers: {},
      } as any;

      const services = createServicesWithRepos();
      const status = await getSessionStatus(services, mockRequest);

      expect(status).toBeNull();
    });

    it('returns null for invalid token via sessionRepo', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid_status_token',
        },
      } as any;

      const services = createServicesWithRepos();
      const status = await getSessionStatus(services, mockRequest);

      expect(status).toBeNull();
    });

    it('falls back to store when sessionRepo is undefined', async () => {
      await store.transact((data) => {
        data.users.push({
          id: 'user_status_fallback',
          handle: 'statusfallback',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_status_fallback',
          name: 'Status Fallback Team',
          slug: 'status-fallback-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_status_fallback',
          userId: 'user_status_fallback',
          teamId: 'team_status_fallback',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const { token } = await createSession(store, 'user', 'user_status_fallback', 'team_status_fallback');

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const services = createServicesWithoutRepos();
      const status = await getSessionStatus(services, mockRequest);

      expect(status).not.toBeNull();
      expect(status?.member.handle).toBe('statusfallback');
    });
  });
});
