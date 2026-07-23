import { afterEach, describe, expect, it } from 'vitest';

import type { RetrievalEvalScenario } from '@trapmap/contracts/evals';
import { createHash } from 'node:crypto';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
import {
  closeExecutionContext,
  createActorSession,
  createExecutionContext,
  seedScenarioFixtures,
} from './adapters.js';
import type { ExecutionContext } from './adapters.js';

async function expectSession(
  ctx: ExecutionContext,
  expected: { subjectType: 'system-admin' | 'user'; activeTeamId?: string | null },
) {
  const session = await ctx.app.skillShareer.identity.sessionRepo.getByTokenHash(
    hashSecret(ctx.sessionToken),
  );

  expect(session).not.toBeNull();
  expect(session!.subjectType).toBe(expected.subjectType);
  if ('activeTeamId' in expected) {
    expect(session!.activeTeamId).toBe(expected.activeTeamId);
  }
  return session!;
}

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

        const session = await expectSession(ctx, {
          subjectType: 'user',
          activeTeamId: 'team_test',
        });
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

        const identity = ctx.app.skillShareer.identity;
        const team = await identity.teamRepo.getById('team_governance');
        expect(team).not.toBeNull();
        expect(team!.id).toBe('team_governance');

        const membershipId = `membership_${ctx.actorId}_team_governance`;
        const membership = await identity.membershipRepo.getById(membershipId);
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

        await expectSession(ctx, { subjectType: 'system-admin' });
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

    it('persists seeded artifact capsules so retrieval can hydrate them back out', async () => {
      const ctx = await createExecutionContext();

      try {
        const scenario: RetrievalEvalScenario = {
          scenarioId: 'test-capsule-hydration',
          description: 'Test seeded capsules remain available for retrieval read model',
          actor: {
            subjectType: 'user',
            activeTeamId: 'team_capsule',
            securityLevel: 5,
            permissions: ['read:artifact'],
          },
          fixtures: {
            knowledgeEntries: [],
            skillArtifacts: [
              {
                id: 'artifact_capsule_hydration',
                teamId: 'team_capsule',
                scope: 'project',
                labels: ['ci-cd', 'pipeline'],
                title: 'CI/CD Capsule Hydration',
                slug: 'cicd-capsule-hydration',
                requiredLevel: 3,
                lifecycleState: 'approved',
                capsules: [
                  {
                    capsuleId: 'capsule_capsule_hydration',
                    content: 'Use GitHub Actions and branch protection for CI/CD safety.',
                    situation: 'Setting up CI/CD',
                    problem: 'Unchecked deploys break main',
                    goal: 'Keep protected branches green',
                    labels: ['ci-cd', 'github-actions'],
                    scope: 'project',
                    requiredLevel: 3,
                  },
                ],
              },
            ],
            graphIndexDocuments: [],
          },
        };

        await seedScenarioFixtures(ctx, { scenarioId: scenario.scenarioId }, scenario);

        const artifacts = await ctx.app.skillShareer.artifactReadProjection.listForRetrieval({
          teamId: 'team_capsule',
        });

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]!.history[0]?.derived?.capsules).toHaveLength(1);
        expect(artifacts[0]!.history[0]?.derived?.capsules[0]?.content).toContain('GitHub Actions');
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

        await expectSession(ctx, { subjectType: 'user', activeTeamId: 'team_actor' });
      } finally {
        await closeExecutionContext(ctx);
      }
    });

    it('hydrates fixtures from a retrieval db snapshot file before seeding', async () => {
      const ctx = await createExecutionContext();

      try {
        const scenario: RetrievalEvalScenario = {
          scenarioId: 'test-snapshot-hydration',
          description: 'Test snapshot-backed scenario hydration',
          actor: {
            subjectType: 'user',
            activeTeamId: 'team_snapshot_override',
            securityLevel: 7,
            permissions: ['read:artifact'],
          },
          snapshot: {
            kind: 'retrieval-db-snapshot',
            path: 'evals/retrieval/fixtures/test-live-snapshot.json',
          },
          fixtures: {
            knowledgeEntries: [],
            skillArtifacts: [],
            graphIndexDocuments: [],
          },
        };

        await seedScenarioFixtures(ctx, { scenarioId: scenario.scenarioId }, scenario);

        const entries = await ctx.app.skillShareer.repos.knowledge.listByFilter({
          teamId: 'team_snapshot',
        });
        const artifacts = await ctx.app.skillShareer.artifactReadProjection.listForRetrieval({
          teamId: 'team_snapshot',
        });
        const session = await expectSession(ctx, {
          subjectType: 'user',
          activeTeamId: 'team_snapshot_override',
        });

        expect(entries).toHaveLength(1);
        expect(entries[0]?.id).toBe('entry_snapshot_1');
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]?.id).toBe('artifact_snapshot_1');
        expect(session).not.toBeNull();
      } finally {
        await closeExecutionContext(ctx);
      }
    });
  });
});
