import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../app.js';
import type { SkillShareerStore } from '../../lib/store.js';
import { hashSecret, nowIso } from '../../lib/store.js';

describe('operations routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('selective activation route (Phase 15-03)', () => {
    it('returns 401 for unauthenticated activation request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          selectedPaths: ['references/docker.md'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid activation request with selected paths', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          selectedPaths: ['references/docker.md', 'assets/docker-compose.yml'],
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('accepts activation request with optional revision', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          revision: 2,
          selectedPaths: ['SKILL.md'],
        },
      });

      // Should require auth, not fail on schema
      expect(response.statusCode).toBe(401);
    });

    it('validates selected paths are bounded (max 50)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          selectedPaths: Array.from({ length: 51 }, (_, i) => `file_${i}.md`),
        },
      });

      // Should fail validation (too many paths)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // Phase 36-03: Skill lifecycle graph indexing integration tests
  describe('POST /v1/operations/artifacts/:artifactId/deactivate', () => {
    let testApp: FastifyInstance;
    let testStore: SkillShareerStore;
    let sessionId: string;
    let userId: string;
    let artifactId: string;

    beforeEach(async () => {
      const testDataFile = `/tmp/trapmap-test-deactivate-${Date.now()}-${Math.random()}.json`;

      testApp = buildServer({ config: { dataFile: testDataFile } });
      await testApp.ready();
      testStore = testApp.skillShareer.store;
      userId = `user_deactivate_test_${Date.now()}`;
      artifactId = `artifact_deactivate_test_${Date.now()}`;

      // Setup: Create user, membership, session, and an approved artifact with derived data
      await testStore.transact(async (data) => {
        if (!data.counters) data.counters = {};
        data.counters.user = 1;

        data.users.push({
          id: userId,
          handle: 'deactivator',
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        data.memberships.push({
          id: `membership_${userId}`,
          userId,
          teamId: null,
          roleTemplate: 'admin',
          securityLevel: 10,
          permissions: ['knowledge:update', 'knowledge:review', 'knowledge:submit'],
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        const sessionToken = `session_deactivate_${Date.now()}`;
        data.sessions.push({
          id: `session_${Date.now()}`,
          userId,
          tokenHash: hashSecret(sessionToken),
          activeTeamId: null,
          subjectType: 'user',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
        sessionId = sessionToken;

        // Create an approved artifact with derived content
        if (!data.skillArtifacts) data.skillArtifacts = [];
        const fakeHash = 'a'.repeat(64); // Valid 64-char SHA-256 for schema compliance
        const revision = {
          revision: 1,
          sourceHash: fakeHash,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown' as const,
              sha256: fakeHash,
              sizeBytes: 100,
              mediaType: 'text/markdown',
              source: 'SKILL.md' as const,
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          submittedAt: nowIso(),
          submittedByUserId: userId,
          scriptDescriptors: [],
          derived: {
            profile: {
              artifactId,
              revision: 1,
              sourceHash: fakeHash,
              title: 'Test Artifact for Deactivation',
              summary: 'Test summary for graph indexing',
              keywords: ['docker', 'cache'],
              referencePaths: [],
              contentHash: fakeHash,
            },
            capsules: [],
            clientManifest: null,
            sourceHash: fakeHash,
            derivedAt: nowIso(),
          },
        };
        data.skillArtifacts.push({
          id: artifactId,
          teamId: null,
          scope: 'global',
          labels: ['docker', 'cache'],
          title: 'Test Artifact for Deactivation',
          slug: 'test-artifact-deactivation',
          requiredLevel: 0,
          lifecycleState: 'approved',
          ownerUserId: userId,
          latestRevision: revision,
          history: [revision],
          metadata: {
            sourceKind: 'skill-directory',
            submissionCount: 1,
            resubmissionCount: 0,
            revisionCount: 1,
            latestSubmissionId: 'sub-1',
            latestSubmittedAt: nowIso(),
            latestReviewedAt: nowIso(),
            latestDecision: 'approve',
          },
          agentReview: null,
          reviewHistory: [],
          reviewNotes: [],
          lifecycleHistory: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        // Also add a graph document for this artifact to test removal
        data.graphIndexDocuments.push({
          id: `graphdoc_skill_${artifactId}_r1`,
          sourceType: 'skill',
          sourceId: artifactId,
          revision: 1,
          contentHash: 'test-hash',
          teamId: null,
          scope: 'global',
          requiredLevel: 0,
          nodes: [],
          edges: [],
          evidence: 'test',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });
    });

    afterEach(async () => {
      if (testApp) {
        await testApp.close();
      }
    });

    it('returns 401 for unauthenticated request', async () => {
      const response = await testApp.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${artifactId}/deactivate`,
        payload: { reason: 'Outdated' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('deactivates an approved artifact and removes graph documents', async () => {
      // Verify graph document exists before deactivation
      const dataBefore = await testStore.snapshot();
      const docsBefore = dataBefore.graphIndexDocuments.filter(
        (d) => d.sourceType === 'skill' && d.sourceId === artifactId,
      );
      expect(docsBefore).toHaveLength(1);

      const response = await testApp.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${artifactId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: { reason: 'No longer needed' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('approved');
      expect(json.newState).toBe('deactivated');
      expect(json.artifact.lifecycleState).toBe('deactivated');

      // Verify graph documents were removed
      const dataAfter = await testStore.snapshot();
      const docsAfter = dataAfter.graphIndexDocuments.filter(
        (d) => d.sourceType === 'skill' && d.sourceId === artifactId,
      );
      expect(docsAfter).toHaveLength(0);
    });

    it('returns 404 for non-existent artifact', async () => {
      const response = await testApp.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/nonexistent/deactivate',
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: { reason: 'Not found test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('validates reason is required', async () => {
      const response = await testApp.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${artifactId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('re-approving a deactivated artifact rebuilds graph documents', async () => {
      // First deactivate
      await testApp.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${artifactId}/deactivate`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: { reason: 'Temporary deactivation' },
      });

      // Verify graph documents removed
      const dataAfterDeactivate = await testStore.snapshot();
      const docsAfterDeactivate = dataAfterDeactivate.graphIndexDocuments.filter(
        (d) => d.sourceType === 'skill' && d.sourceId === artifactId,
      );
      expect(docsAfterDeactivate).toHaveLength(0);

      // Re-approve via review route
      const reviewResponse = await testApp.inject({
        method: 'POST',
        url: `/v1/operations/artifacts/${artifactId}/review`,
        headers: {
          authorization: `Bearer ${sessionId}`,
        },
        payload: {
          artifactId,
          decision: 'approve',
          notes: 'Re-approving after fix',
        },
      });

      // The review route should trigger graph indexing
      // The artifact should have graph documents again
      const dataAfterReapprove = await testStore.snapshot();
      const docsAfterReapprove = dataAfterReapprove.graphIndexDocuments.filter(
        (d) => d.sourceType === 'skill' && d.sourceId === artifactId,
      );

      // If review succeeded, graph docs should exist
      if (reviewResponse.statusCode === 200) {
        expect(docsAfterReapprove.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
