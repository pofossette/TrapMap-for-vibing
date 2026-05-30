import { afterEach, describe, expect, it } from 'vitest';

import type { RetrievalEvalScenario } from '@trapmap/contracts/evals';
import { hashSecret } from '../../../packages/server/src/lib/store.js';
import {
  closeExecutionContext,
  createActorSession,
  createExecutionContext,
  seedScenarioFixtures,
} from './adapters.js';

describe('adapters', () => {
  describe('createActorSession', () => {
    it('replaces system-admin session with user session in PG mode', async () => {
      const ctx = await createExecutionContext();

      try {
        const actor = {
          subjectType: 'user' as const,
          activeTeamId: 'team_test',
          securityLevel: 5,
          permissions: ['read:knowledge'],
        };

        await createActorSession(ctx, actor);

        const repos = ctx.app.skillShareer.repos;
        const session = await repos.session.getByTokenHash(hashSecret(ctx.sessionToken));

        expect(session).not.toBeNull();
        expect(session!.subjectType).toBe('user');
        expect(session!.activeTeamId).toBe('team_test');
        expect(session!.userId).toBe(ctx.actorId);
      } finally {
        await closeExecutionContext(ctx);
      }
    });

    it('creates team and membership for actor in PG mode', async () => {
      const ctx = await createExecutionContext();

      try {
        const actor = {
          subjectType: 'user' as const,
          activeTeamId: 'team_governance',
          securityLevel: 3,
          permissions: ['read:knowledge'],
        };

        await createActorSession(ctx, actor);

        const repos = ctx.app.skillShareer.repos;
        const team = await repos.team.getById('team_governance');
        expect(team).not.toBeNull();
        expect(team!.id).toBe('team_governance');

        const membershipId = `membership_${ctx.actorId}_team_governance`;
        const membership = await repos.membership.getById(membershipId);
        expect(membership).not.toBeNull();
        expect(membership!.securityLevel).toBe(3);
        expect(membership!.permissions).toEqual(['read:knowledge']);
      } finally {
        await closeExecutionContext(ctx);
      }
    });

    it('preserves system-admin subjectType when actor is system-admin', async () => {
      const ctx = await createExecutionContext();

      try {
        const actor = {
          subjectType: 'system-admin' as const,
          activeTeamId: null,
          securityLevel: 10,
          permissions: [],
        };

        await createActorSession(ctx, actor);

        const repos = ctx.app.skillShareer.repos;
        const session = await repos.session.getByTokenHash(hashSecret(ctx.sessionToken));

        expect(session).not.toBeNull();
        expect(session!.subjectType).toBe('system-admin');
      } finally {
        await closeExecutionContext(ctx);
      }
    });
  });

  describe('seedScenarioFixtures', () => {
    it('seeds graph index documents through repos.graphIndex.upsert()', async () => {
      const ctx = await createExecutionContext();

      try {
        const scenario: RetrievalEvalScenario = {
          scenarioId: 'test-graph-seed',
          description: 'Test graph doc seeding',
          actor: {
            subjectType: 'user',
            activeTeamId: 'team_graph',
            securityLevel: 5,
            permissions: [],
          },
          fixtures: {
            knowledgeEntries: [],
            skillArtifacts: [],
            graphIndexDocuments: [
              {
                id: 'graph_doc_1',
                sourceType: 'skill',
                sourceId: 'artifact_1',
                revision: 1,
                contentHash: 'hash1',
                teamId: 'team_graph',
                scope: 'project',
                requiredLevel: 0,
                nodes: [],
                edges: [],
                evidence: 'test evidence',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        };

        const mockCase = {
          scenarioId: 'test-graph-seed',
        };

        await seedScenarioFixtures(ctx, mockCase, scenario);

        const repos = ctx.app.skillShareer.repos;
        const graphDocs = await repos.graphIndex.listAll();

        expect(graphDocs.length).toBeGreaterThan(0);
        const seeded = graphDocs.find((d) => d.id === 'graph_doc_1');
        expect(seeded).toBeDefined();
        expect(seeded!.sourceType).toBe('skill');
        expect(seeded!.sourceId).toBe('artifact_1');
      } finally {
        await closeExecutionContext(ctx);
      }
    });

    it('creates session with actor subjectType after seeding', async () => {
      const ctx = await createExecutionContext();

      try {
        const scenario: RetrievalEvalScenario = {
          scenarioId: 'test-actor-session',
          description: 'Test actor session creation',
          actor: {
            subjectType: 'user',
            activeTeamId: 'team_actor',
            securityLevel: 7,
            permissions: ['read:artifact'],
          },
          fixtures: {
            knowledgeEntries: [],
            skillArtifacts: [],
            graphIndexDocuments: [],
          },
        };

        const mockCase = {
          scenarioId: 'test-actor-session',
        };

        await seedScenarioFixtures(ctx, mockCase, scenario);

        const repos = ctx.app.skillShareer.repos;
        const session = await repos.session.getByTokenHash(hashSecret(ctx.sessionToken));

        expect(session).not.toBeNull();
        expect(session!.subjectType).toBe('user');
        expect(session!.activeTeamId).toBe('team_actor');
      } finally {
        await closeExecutionContext(ctx);
      }
    });
  });
});
