/**
 * Tests for TeamRepository and MembershipRepository interfaces and InMemory implementations.
 *
 * Phase: 83-03 (Store Decoupling)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import type { SkillShareerStore } from '../store.js';
import { nowIso } from '../store.js';
import {
  InMemoryMembershipRepository,
  InMemoryTeamRepository,
  createMembershipRepository,
  createTeamRepository,
} from './index.js';

describe('TeamRepository', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let teamRepo: InMemoryTeamRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-team-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    teamRepo = new InMemoryTeamRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('nextId', () => {
    it('generates ID with correct format', async () => {
      const id = await teamRepo.nextId();

      expect(id).toMatch(/^team_\d+$/);
    });

    it('returns incrementing IDs within same snapshot', async () => {
      // Verify that within a single snapshot view, IDs increment
      const data = await store.snapshot();

      const id1 = store.nextId(data, 'team');
      const id2 = store.nextId(data, 'team');

      expect(id1).toMatch(/^team_\d+$/);
      expect(id2).toMatch(/^team_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('insert', () => {
    it('inserts a team', async () => {
      const team = {
        id: 'team_insert_1',
        name: 'Insert Team',
        slug: 'insert-team',
        description: 'Test team',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await teamRepo.insert(team);

      const data = await store.snapshot();
      const found = data.teams.find((t) => t.id === 'team_insert_1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Insert Team');
    });

    it('can insert team with null description', async () => {
      const team = {
        id: 'team_null_desc',
        name: 'No Description Team',
        slug: 'no-desc-team',
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await teamRepo.insert(team);

      const found = await teamRepo.getById('team_null_desc');
      expect(found?.description).toBeNull();
    });
  });

  describe('getById', () => {
    it('finds team by id', async () => {
      await store.transact((data) => {
        data.teams.push({
          id: 'team_getbyid_1',
          name: 'GetById Team',
          slug: 'getbyid-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await teamRepo.getById('team_getbyid_1');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('GetById Team');
    });

    it('returns null for non-existent id', async () => {
      const found = await teamRepo.getById('team_nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('getBySlug', () => {
    it('finds team by slug', async () => {
      await store.transact((data) => {
        data.teams.push({
          id: 'team_slug_1',
          name: 'Slug Team',
          slug: 'unique-slug-team',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await teamRepo.getBySlug('unique-slug-team');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('team_slug_1');
    });

    it('returns null for non-existent slug', async () => {
      const found = await teamRepo.getBySlug('nonexistent-slug');
      expect(found).toBeNull();
    });
  });

  describe('listAll', () => {
    it('returns all teams', async () => {
      await store.transact((data) => {
        data.teams.push({
          id: 'team_list_1',
          name: 'Team 1',
          slug: 'team-1',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.teams.push({
          id: 'team_list_2',
          name: 'Team 2',
          slug: 'team-2',
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const teams = await teamRepo.listAll();

      expect(teams).toHaveLength(2);
      expect(teams.map((t) => t.id).sort()).toEqual(['team_list_1', 'team_list_2']);
    });

    it('returns empty array when no teams exist', async () => {
      const teams = await teamRepo.listAll();
      expect(teams).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates team fields', async () => {
      await store.transact((data) => {
        data.teams.push({
          id: 'team_update_1',
          name: 'Original Name',
          slug: 'original-slug',
          description: 'Original description',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await teamRepo.update('team_update_1', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      const found = await teamRepo.getById('team_update_1');
      expect(found?.name).toBe('Updated Name');
      expect(found?.description).toBe('Updated description');
      expect(found?.slug).toBe('original-slug'); // Unchanged
    });

    it('updates updatedAt timestamp', async () => {
      const originalTime = nowIso();
      await store.transact((data) => {
        data.teams.push({
          id: 'team_timestamp_1',
          name: 'Timestamp Team',
          slug: 'timestamp-team',
          description: null,
          createdAt: originalTime,
          updatedAt: originalTime,
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await teamRepo.update('team_timestamp_1', { name: 'New Name' });

      const found = await teamRepo.getById('team_timestamp_1');
      expect(found?.updatedAt > originalTime).toBe(true);
    });

    it('does not throw for non-existent team', async () => {
      await expect(teamRepo.update('team_nonexistent', { name: 'test' })).resolves.toBeUndefined();
    });
  });
});

describe('MembershipRepository', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;
  let membershipRepo: InMemoryMembershipRepository;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-membership-repo-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
    membershipRepo = new InMemoryMembershipRepository(store);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('nextId', () => {
    it('generates ID with correct format', async () => {
      const id = await membershipRepo.nextId();

      expect(id).toMatch(/^member_\d+$/);
    });

    it('returns incrementing IDs within same snapshot', async () => {
      // Verify that within a single snapshot view, IDs increment
      const data = await store.snapshot();

      const id1 = store.nextId(data, 'member');
      const id2 = store.nextId(data, 'member');

      expect(id1).toMatch(/^member_\d+$/);
      expect(id2).toMatch(/^member_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('insert', () => {
    it('inserts a membership', async () => {
      const membership = {
        id: 'membership_insert_1',
        userId: 'user_1',
        teamId: 'team_1',
        roleTemplate: 'admin' as const,
        securityLevel: 10,
        permissions: [],
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      await membershipRepo.insert(membership);

      const data = await store.snapshot();
      const found = data.memberships.find((m) => m.id === 'membership_insert_1');
      expect(found).toBeDefined();
      expect(found?.userId).toBe('user_1');
      expect(found?.teamId).toBe('team_1');
    });
  });

  describe('getById', () => {
    it('finds membership by id', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_getbyid_1',
          userId: 'user_getbyid',
          teamId: 'team_getbyid',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await membershipRepo.getById('membership_getbyid_1');

      expect(found).not.toBeNull();
      expect(found?.userId).toBe('user_getbyid');
    });

    it('returns null for non-existent id', async () => {
      const found = await membershipRepo.getById('membership_nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByUserAndTeam', () => {
    it('finds membership by user and team', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_find_1',
          userId: 'user_find',
          teamId: 'team_find',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await membershipRepo.findByUserAndTeam('user_find', 'team_find');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('membership_find_1');
    });

    it('returns null when no membership exists', async () => {
      const found = await membershipRepo.findByUserAndTeam(
        'user_no_membership',
        'team_no_membership',
      );
      expect(found).toBeNull();
    });

    it('returns correct membership when user has multiple team memberships', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_multi_1',
          userId: 'user_multi',
          teamId: 'team_multi_1',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_multi_2',
          userId: 'user_multi',
          teamId: 'team_multi_2',
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const found = await membershipRepo.findByUserAndTeam('user_multi', 'team_multi_2');

      expect(found?.id).toBe('membership_multi_2');
      expect(found?.roleTemplate).toBe('member');
    });
  });

  describe('listByUser', () => {
    it('lists all memberships for a user', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_listuser_1',
          userId: 'user_list',
          teamId: 'team_1',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_listuser_2',
          userId: 'user_list',
          teamId: 'team_2',
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_otheruser',
          userId: 'user_other',
          teamId: 'team_3',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const memberships = await membershipRepo.listByUser('user_list');

      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.id).sort()).toEqual([
        'membership_listuser_1',
        'membership_listuser_2',
      ]);
    });

    it('returns empty array for user with no memberships', async () => {
      const memberships = await membershipRepo.listByUser('user_nomemberships');
      expect(memberships).toEqual([]);
    });
  });

  describe('listByTeam', () => {
    it('lists all memberships for a team', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_listteam_1',
          userId: 'user_1',
          teamId: 'team_list',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_listteam_2',
          userId: 'user_2',
          teamId: 'team_list',
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: 'membership_otherteam',
          userId: 'user_3',
          teamId: 'team_other',
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      const memberships = await membershipRepo.listByTeam('team_list');

      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.id).sort()).toEqual([
        'membership_listteam_1',
        'membership_listteam_2',
      ]);
    });

    it('returns empty array for team with no memberships', async () => {
      const memberships = await membershipRepo.listByTeam('team_nomembers');
      expect(memberships).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates membership fields', async () => {
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_update_1',
          userId: 'user_update',
          teamId: 'team_update',
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await membershipRepo.update('membership_update_1', {
        securityLevel: 10,
        roleTemplate: 'admin',
      });

      const found = await membershipRepo.getById('membership_update_1');
      expect(found?.securityLevel).toBe(10);
      expect(found?.roleTemplate).toBe('admin');
    });

    it('updates updatedAt timestamp', async () => {
      const originalTime = nowIso();
      await store.transact((data) => {
        data.memberships.push({
          id: 'membership_ts_update',
          userId: 'user_ts',
          teamId: 'team_ts',
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt: originalTime,
          updatedAt: originalTime,
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await membershipRepo.update('membership_ts_update', { securityLevel: 8 });

      const found = await membershipRepo.getById('membership_ts_update');
      expect(found?.updatedAt > originalTime).toBe(true);
    });

    it('does not throw for non-existent membership', async () => {
      await expect(
        membershipRepo.update('membership_nonexistent', { securityLevel: 10 }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('Repository factory functions', () => {
  let app: FastifyInstance;
  let store: SkillShareerStore;

  beforeEach(async () => {
    const testDataFile = `/tmp/trapmap-test-team-factory-${Date.now()}-${Math.random()}.json`;
    app = buildServer({ config: { dataFile: testDataFile } });
    await app.ready();
    store = app.skillShareer.store;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('createTeamRepository returns InMemoryTeamRepository', () => {
    const repo = createTeamRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryTeamRepository);
  });

  it('createMembershipRepository returns InMemoryMembershipRepository', () => {
    const repo = createMembershipRepository({ store });
    expect(repo).toBeInstanceOf(InMemoryMembershipRepository);
  });

  it('factories accept optional pool parameter', () => {
    const teamRepo = createTeamRepository({ pool: undefined, store });
    const membershipRepo = createMembershipRepository({ pool: undefined, store });

    expect(teamRepo).toBeInstanceOf(InMemoryTeamRepository);
    expect(membershipRepo).toBeInstanceOf(InMemoryMembershipRepository);
  });
});
