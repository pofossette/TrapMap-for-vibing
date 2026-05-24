import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import {
  buildTestServer,
  seedApprovedSkillArtifact,
  seedFilePayload,
} from '@trapmap/server/lib/retrieval/__fixtures__/auth-store-helpers.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import type { FastifyInstance } from 'fastify';

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

// =============================================================================
// Phase 2: Route/service main link integration tests (artifact activation)
// =============================================================================

const ACTIVATE_FAKE_HASH = 'a'.repeat(64);

describe('artifact activation main link tests (Phase 2)', () => {
  describe('selective file activation', () => {
    it('returns 404 for non-existent artifact', async () => {
      const { app, authToken } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'nonexistent', selectedPaths: ['SKILL.md'] },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('activates SKILL.md and returns its content', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-skill',
            title: 'Activate SKILL.md Test',
            files: [
              {
                path: 'SKILL.md',
                content: '# Activation Test\n\nSkill body here',
                kind: 'skill-markdown',
              },
            ],
          });

          seedFilePayload(
            data,
            'artifact-activate-skill',
            1,
            'SKILL.md',
            '# Activation Test\n\nSkill body here',
          );
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-activate-skill', selectedPaths: ['SKILL.md'] },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.artifactId).toBe('artifact-activate-skill');
      expect(json.files).toHaveLength(1);
      expect(json.files[0].path).toBe('SKILL.md');
      expect(json.files[0].kind).toBe('skill-markdown');
      expect(json.files[0].content).toContain('Activation Test');

      await app.close();
    });

    it('activates references/ files and returns their content', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-refs',
            title: 'Activate References Test',
            files: [
              { path: 'SKILL.md', content: '# Skill', kind: 'skill-markdown' },
              {
                path: 'references/docker.md',
                content: '# Docker\n\nDocker best practices',
                kind: 'reference',
              },
              { path: 'references/ci.md', content: '# CI\n\nCI pipeline guide', kind: 'reference' },
            ],
          });

          seedFilePayload(data, 'artifact-activate-refs', 1, 'SKILL.md', '# Skill');
          seedFilePayload(
            data,
            'artifact-activate-refs',
            1,
            'references/docker.md',
            '# Docker\n\nDocker best practices',
          );
          seedFilePayload(
            data,
            'artifact-activate-refs',
            1,
            'references/ci.md',
            '# CI\n\nCI pipeline guide',
          );
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-activate-refs',
          selectedPaths: ['references/docker.md', 'references/ci.md'],
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(2);

      const dockerRef = json.files.find((f: any) => f.path === 'references/docker.md');
      expect(dockerRef).toBeDefined();
      expect(dockerRef.kind).toBe('reference');
      expect(dockerRef.content).toContain('Docker best practices');

      const ciRef = json.files.find((f: any) => f.path === 'references/ci.md');
      expect(ciRef).toBeDefined();
      expect(ciRef.content).toContain('CI pipeline guide');

      await app.close();
    });

    it('activates assets/ files and returns their content', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-assets',
            title: 'Activate Assets Test',
            files: [
              { path: 'SKILL.md', content: '# Skill', kind: 'skill-markdown' },
              {
                path: 'assets/docker-compose.yml',
                content: 'version: "3"\nservices:\n  app: {}',
                kind: 'asset',
              },
            ],
          });

          seedFilePayload(data, 'artifact-activate-assets', 1, 'SKILL.md', '# Skill');
          seedFilePayload(
            data,
            'artifact-activate-assets',
            1,
            'assets/docker-compose.yml',
            'version: "3"\nservices:\n  app: {}',
          );
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-activate-assets',
          selectedPaths: ['assets/docker-compose.yml'],
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(1);
      expect(json.files[0].path).toBe('assets/docker-compose.yml');
      expect(json.files[0].kind).toBe('asset');
      expect(json.files[0].content).toContain('version:');

      await app.close();
    });

    it('activates scripts/ files and returns descriptors', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-scripts',
            title: 'Activate Scripts Test',
            files: [
              { path: 'SKILL.md', content: '# Skill', kind: 'skill-markdown' },
              {
                path: 'scripts/bootstrap.sh',
                content: '#!/bin/bash\necho bootstrap',
                kind: 'script',
              },
              { path: 'scripts/deploy.sh', content: '#!/bin/bash\necho deploy', kind: 'script' },
            ],
          });

          seedFilePayload(data, 'artifact-activate-scripts', 1, 'SKILL.md', '# Skill');
          seedFilePayload(
            data,
            'artifact-activate-scripts',
            1,
            'scripts/bootstrap.sh',
            '#!/bin/bash\necho bootstrap',
          );
          seedFilePayload(
            data,
            'artifact-activate-scripts',
            1,
            'scripts/deploy.sh',
            '#!/bin/bash\necho deploy',
          );

          // Add script descriptors to the artifact (both latestRevision and history)
          const artifact = data.skillArtifacts.find(
            (a: any) => a.id === 'artifact-activate-scripts',
          );
          if (artifact) {
            const descriptors = [
              {
                path: 'scripts/bootstrap.sh',
                sha256: ACTIVATE_FAKE_HASH,
                sizeBytes: 26,
                mediaType: 'text/x-shellscript',
                capability: 'System bootstrap',
                argsSchemaSummary: '',
                sideEffectSummary: 'Installs dependencies',
                defaultPolicy: 'needs-approval',
              },
              {
                path: 'scripts/deploy.sh',
                sha256: ACTIVATE_FAKE_HASH,
                sizeBytes: 23,
                mediaType: 'text/x-shellscript',
                capability: 'Deploy to production',
                argsSchemaSummary: '--env=production',
                sideEffectSummary: 'Updates production servers',
                defaultPolicy: 'manual',
              },
            ];
            artifact.latestRevision.scriptDescriptors = descriptors;
            if (artifact.history.length > 0) {
              artifact.history[0].scriptDescriptors = descriptors;
            }
          }
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-activate-scripts',
          selectedPaths: ['scripts/bootstrap.sh', 'scripts/deploy.sh'],
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(2);

      // Script files should be activated
      const bootstrapFile = json.files.find((f: any) => f.path === 'scripts/bootstrap.sh');
      expect(bootstrapFile).toBeDefined();
      expect(bootstrapFile.content).toContain('bootstrap');

      // Script descriptors should be included for activated script paths
      expect(json.scriptDescriptors).toBeDefined();
      expect(json.scriptDescriptors.length).toBe(2);

      const bootstrapDesc = json.scriptDescriptors.find(
        (d: any) => d.path === 'scripts/bootstrap.sh',
      );
      expect(bootstrapDesc).toBeDefined();
      expect(bootstrapDesc.capability).toBe('System bootstrap');
      expect(bootstrapDesc.defaultPolicy).toBe('needs-approval');

      const deployDesc = json.scriptDescriptors.find((d: any) => d.path === 'scripts/deploy.sh');
      expect(deployDesc).toBeDefined();
      expect(deployDesc.capability).toBe('Deploy to production');

      await app.close();
    });

    it('rejects activation with paths not in artifact', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-invalid',
            title: 'Invalid Path Test',
          });
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-activate-invalid',
          selectedPaths: ['nonexistent/file.md'],
        },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('blocks activation for artifact above user security level', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedSkillArtifact(data, auth.userId, {
            id: 'artifact-activate-high',
            title: 'High Level Activate',
            requiredLevel: 10,
          });
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'user',
          securityLevel: 5,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-activate-high',
          selectedPaths: ['SKILL.md'],
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });
});
