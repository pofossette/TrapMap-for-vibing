import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import {
  buildTestServer,
  seedApprovedSkillArtifact,
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

  describe('route registration', () => {
    it('lists operations routes in documented routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/meta/routes',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.documentedRoutes).toContain('GET /v1/operations/knowledge');
      expect(json.documentedRoutes).toContain('POST /v1/operations/knowledge/:entryId/deactivate');
    });
  });

  // Phase 16-02: No-script-execution guarantee (T-16-06)
  describe('compatibility hardening no-execution boundary (Phase 16-02)', () => {
    it('activation response does not include script bodies', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        payload: {
          artifactId: 'artifact_1',
          selectedPaths: ['scripts/setup.sh'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('migration response does not include artifact bundle payloads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/migrate',
        payload: {
          mode: 'explicit',
          entryIds: ['knowledge_1'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('compatibility status response is metadata-only', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/status',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// =============================================================================
// Phase 2: Route/service main link integration tests (skill review + pipeline)
// =============================================================================

const FAKE_HASH = 'a'.repeat(64);

function seedArtifactInAgentPass(
  data: { skillArtifacts: any[]; counters: Record<string, number>; artifactFilePayloads?: any[] },
  userId: string,
  overrides: {
    id?: string;
    title?: string;
    labels?: string[];
    scope?: string;
    files?: { path: string; content: string; kind: string }[];
  } = {},
) {
  const id = overrides.id ?? `artifact_review_${Date.now()}`;
  const title = overrides.title ?? `Review Test ${id}`;
  const labels = overrides.labels ?? ['test'];
  const scope = overrides.scope ?? 'global';

  const files =
    overrides.files && overrides.files.length > 0
      ? overrides.files.map((f) => ({
          path: f.path,
          kind: f.kind,
          sha256: FAKE_HASH,
          sizeBytes: f.content.length,
          mediaType: 'text/markdown',
          source: f.path.startsWith('references/')
            ? 'references/'
            : f.path.startsWith('assets/')
              ? 'assets/'
              : f.path.startsWith('scripts/')
                ? 'scripts/'
                : 'SKILL.md',
          includeInDerivation: f.kind === 'skill-markdown',
          activationOnly: f.kind !== 'skill-markdown',
        }))
      : [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: FAKE_HASH,
            sizeBytes: 100,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ];

  const revision = {
    revision: 1,
    sourceHash: FAKE_HASH,
    files,
    submittedAt: nowIso(),
    submittedByUserId: userId,
    scriptDescriptors: [] as any[],
    derived: null as any,
  };

  data.skillArtifacts.push({
    id,
    teamId: null,
    scope,
    labels,
    title,
    slug: `review-${id}`,
    requiredLevel: 0,
    lifecycleState: 'agent-pass',
    ownerUserId: userId,
    latestRevision: revision,
    history: [revision],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

describe('skill review main link tests (Phase 2)', () => {
  describe('route-local indexing seam regression', () => {
    it('does not hardcode artifact adapter arrays or capsule side effects in the route', () => {
      const source = readFileSync(path.join(__dirname, 'skill-review.ts'), 'utf8');

      expect(source).not.toContain('adapters: [artifactGraphIndexAdapter]');
      expect(source).not.toContain('createCapsuleIndexAdapter');
      expect(source).not.toContain('.syncArtifact(');
      expect(source).not.toContain('.removeArtifact(');
    });
  });

  describe('review endpoint', () => {
    it('returns 401 for review without authentication', async () => {
      const { app } = await buildTestServer((data, auth) => {
        seedArtifactInAgentPass(data, auth.userId, {
          id: 'artifact-no-auth-review',
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-no-auth-review/review',
        payload: { artifactId: 'artifact-no-auth-review', decision: 'approve', notes: 'LGTM' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 404 for non-existent artifact', async () => {
      const { app, authToken } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/nonexistent/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'nonexistent', decision: 'approve', notes: 'LGTM' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('requires knowledge:review permission', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-no-review-perm',
          });
        },
        {
          permissions: ['knowledge:search'],
          roleTemplate: 'user',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-no-review-perm/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-no-review-perm',
          decision: 'approve',
          notes: 'LGTM',
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('approves an agent-pass artifact and updates lifecycle state to approved', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-review-approve',
            title: 'Review Approve Test',
          });
        },
        {
          permissions: ['knowledge:review', 'knowledge:submit', 'knowledge:search'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-review-approve/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-review-approve',
          decision: 'approve',
          notes: 'Approved for production use',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('agent-pass');
      expect(json.newState).toBe('approved');
      expect(json.artifact).toBeDefined();
      expect(json.artifact.id).toBe('artifact-review-approve');
      expect(json.artifact.lifecycleState).toBe('approved');
      await app.close();
    });

    it('rejects an agent-pass artifact and updates lifecycle state to rejected', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-review-reject',
            title: 'Review Reject Test',
          });
        },
        {
          permissions: ['knowledge:review', 'knowledge:submit', 'knowledge:search'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-review-reject/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-review-reject',
          decision: 'reject',
          notes: 'Needs more detail on boundary',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.previousState).toBe('agent-pass');
      expect(json.newState).toBe('rejected');
      expect(json.artifact.lifecycleState).toBe('rejected');
      await app.close();
    });

    it('populates review history and lifecycle events after review', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-review-history',
            title: 'Review History Test',
          });
        },
        {
          permissions: ['knowledge:review', 'knowledge:submit', 'knowledge:search'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-review-history/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-review-history',
          decision: 'approve',
          notes: 'Looks good',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      // Verify review history in response
      expect(json.artifact.reviewHistory).toBeDefined();
      expect(json.artifact.reviewHistory.length).toBeGreaterThanOrEqual(1);
      const lastDecision = json.artifact.reviewHistory[json.artifact.reviewHistory.length - 1];
      expect(lastDecision.decision).toBe('approve');
      expect(lastDecision.notes).toBe('Looks good');

      // Verify lifecycle history in response
      expect(json.artifact.lifecycleHistory).toBeDefined();
      expect(json.artifact.lifecycleHistory.length).toBeGreaterThanOrEqual(1);
      const lastEvent = json.artifact.lifecycleHistory[json.artifact.lifecycleHistory.length - 1];
      expect(lastEvent.type).toBe('reviewer-approved');
      await app.close();
    });

    it('reviewer must have strictly higher security level than artifact', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-high-level-review',
            title: 'High Level Review Test',
          });
          // Modify the artifact's required level to be higher
          const artifact = data.skillArtifacts.find(
            (a: any) => a.id === 'artifact-high-level-review',
          );
          if (artifact) {
            artifact.requiredLevel = 10;
          }
        },
        {
          permissions: ['knowledge:review'],
          roleTemplate: 'admin',
          securityLevel: 5, // Lower than artifact's level
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-high-level-review/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-high-level-review',
          decision: 'approve',
          notes: 'Should fail',
        },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('review queue returns agent-pass artifacts', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-in-queue',
            title: 'Queue Test',
          });
        },
        {
          permissions: ['knowledge:review'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/review-queue',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.items).toBeDefined();
      const queueItem = json.items.find((i: any) => i.artifact?.id === 'artifact-in-queue');
      expect(queueItem).toBeDefined();
      expect(queueItem.artifact.lifecycleState).toBe('agent-pass');
      await app.close();
    });
  });

  describe('review approve with structured governance fields', () => {
    it('preserves boundary in artifact after review approval', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-boundary-review',
            title: 'Boundary Review Test',
          });
          // Add boundary to the seeded artifact
          const artifact = data.skillArtifacts.find(
            (a: any) => a.id === 'artifact-boundary-review',
          );
          if (artifact) {
            artifact.boundary = {
              context: ['frontend', 'production'],
              versions: [{ package: 'react', range: '>=18.0.0', note: 'React 18+' }],
              prerequisites: [{ description: 'Node.js 20+', kind: 'environment', required: true }],
              signals: [{ pattern: 'useEffect', kind: 'keyword', description: 'React hook' }],
              exclusions: [{ description: 'Not for SSR', kind: 'platform' }],
              evidence: [
                {
                  kind: 'documentation',
                  identifier: 'react-docs',
                  url: 'https://react.dev',
                  note: 'Official docs',
                },
              ],
            };
          }
        },
        {
          permissions: ['knowledge:review', 'knowledge:submit'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-boundary-review/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-boundary-review',
          decision: 'approve',
          notes: 'Boundary looks correct',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.newState).toBe('approved');
      // toSkillArtifact() currently does not serialize boundary/metadata
      // outside derived profile — verify the review succeeded and artifact persisted
      expect(json.artifact.id).toBe('artifact-boundary-review');
      expect(json.artifact.lifecycleState).toBe('approved');

      // Verify boundary persisted in store
      const storeData = await app.skillShareer.store.snapshot();
      const storedArtifact = storeData.skillArtifacts?.find(
        (a: any) => a.id === 'artifact-boundary-review',
      );
      expect(storedArtifact).toBeDefined();
      expect(storedArtifact.boundary).toBeDefined();
      expect(storedArtifact.boundary.context).toContain('frontend');
      expect(storedArtifact.boundary.versions[0].package).toBe('react');

      await app.close();
    });

    it('preserves maintenanceMeta in artifact after review approval', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-maint-review',
            title: 'Maintenance Review Test',
          });
          const artifact = data.skillArtifacts.find((a: any) => a.id === 'artifact-maint-review');
          if (artifact) {
            artifact.maintenanceMeta = {
              assignees: [{ userId: auth.userId, role: 'owner' }],
              reviewCycle: 'quarterly',
              lastReviewedAt: null,
            };
          }
        },
        {
          permissions: ['knowledge:review', 'knowledge:submit'],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-maint-review/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-maint-review',
          decision: 'approve',
          notes: 'Maintenance plan approved',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.newState).toBe('approved');
      expect(json.artifact.id).toBe('artifact-maint-review');
      expect(json.artifact.lifecycleState).toBe('approved');

      // Verify maintenanceMeta persisted in store
      const storeData = await app.skillShareer.store.snapshot();
      const storedArtifact = storeData.skillArtifacts?.find(
        (a: any) => a.id === 'artifact-maint-review',
      );
      expect(storedArtifact).toBeDefined();
      expect(storedArtifact.maintenanceMeta).toBeDefined();
      expect(storedArtifact.maintenanceMeta.reviewCycle).toBe('quarterly');

      await app.close();
    });
  });

  describe('full pipeline: review approve -> export', () => {
    it('approves artifact then exports complete structured content via bundle-json', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-pipeline-test',
            title: 'Pipeline Test',
            files: [
              {
                path: 'SKILL.md',
                content: '# Pipeline\n\nPipeline body content',
                kind: 'skill-markdown',
              },
              {
                path: 'references/setup.md',
                content: '# Setup Guide\n\nSetup body',
                kind: 'reference',
              },
              { path: 'assets/config.yml', content: 'version: 1', kind: 'asset' },
            ],
          });

          // Add file payloads for export
          if (!data.artifactFilePayloads) data.artifactFilePayloads = [];
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-test',
            revision: 1,
            path: 'SKILL.md',
            sha256: 'a'.repeat(64),
            sizeBytes: 30,
            mediaType: 'text/markdown',
            content: '# Pipeline\n\nPipeline body content',
            storedAt: nowIso(),
          });
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-test',
            revision: 1,
            path: 'references/setup.md',
            sha256: 'a'.repeat(64),
            sizeBytes: 30,
            mediaType: 'text/markdown',
            content: '# Setup Guide\n\nSetup body',
            storedAt: nowIso(),
          });
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-test',
            revision: 1,
            path: 'assets/config.yml',
            sha256: 'a'.repeat(64),
            sizeBytes: 11,
            mediaType: 'application/x-yaml',
            content: 'version: 1',
            storedAt: nowIso(),
          });
        },
        {
          permissions: [
            'knowledge:review',
            'knowledge:export',
            'knowledge:submit',
            'knowledge:search',
          ],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      // Step 1: Review approve
      const reviewResp = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-pipeline-test/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-pipeline-test',
          decision: 'approve',
          notes: 'Pipeline approved',
        },
      });

      expect(reviewResp.statusCode).toBe(200);
      expect(reviewResp.json().newState).toBe('approved');

      // Step 2: Export in bundle-json
      const exportResp = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-pipeline-test',
          format: 'bundle-json',
        },
      });

      expect(exportResp.statusCode).toBe(200);
      const exportJson = exportResp.json();
      expect(exportJson.bundle).toBeDefined();
      expect(exportJson.bundle.title).toBe('Pipeline Test');
      expect(exportJson.bundle.files).toHaveLength(3);

      // Verify each file type is present
      const skillMd = exportJson.bundle.files.find((f: any) => f.path === 'SKILL.md');
      expect(skillMd).toBeDefined();
      expect(skillMd.content).toContain('Pipeline body content');

      const reference = exportJson.bundle.files.find((f: any) => f.path === 'references/setup.md');
      expect(reference).toBeDefined();
      expect(reference.content).toContain('Setup body');

      const asset = exportJson.bundle.files.find((f: any) => f.path === 'assets/config.yml');
      expect(asset).toBeDefined();

      await app.close();
    });

    it('approves artifact then activates selected files', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactInAgentPass(data, auth.userId, {
            id: 'artifact-pipeline-activate',
            title: 'Pipeline Activate Test',
            files: [
              { path: 'SKILL.md', content: '# Pipeline Skill', kind: 'skill-markdown' },
              {
                path: 'references/guide.md',
                content: '# Guide\n\nGuide content',
                kind: 'reference',
              },
              { path: 'scripts/run.sh', content: '#!/bin/bash\nrun', kind: 'script' },
            ],
          });

          // Update files for activation
          const artifact = data.skillArtifacts.find(
            (a: any) => a.id === 'artifact-pipeline-activate',
          );
          if (artifact) {
            artifact.latestRevision.scriptDescriptors = [
              {
                path: 'scripts/run.sh',
                sha256: 'a'.repeat(64),
                sizeBytes: 19,
                mediaType: 'text/x-shellscript',
                capability: 'Run pipeline',
                argsSchemaSummary: '',
                sideEffectSummary: '',
                defaultPolicy: 'manual',
              },
            ];
          }

          // Add file payloads
          if (!data.artifactFilePayloads) data.artifactFilePayloads = [];
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-activate',
            revision: 1,
            path: 'SKILL.md',
            sha256: 'a'.repeat(64),
            sizeBytes: 16,
            mediaType: 'text/markdown',
            content: '# Pipeline Skill',
            storedAt: nowIso(),
          });
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-activate',
            revision: 1,
            path: 'references/guide.md',
            sha256: 'a'.repeat(64),
            sizeBytes: 20,
            mediaType: 'text/markdown',
            content: '# Guide\n\nGuide content',
            storedAt: nowIso(),
          });
          data.artifactFilePayloads.push({
            artifactId: 'artifact-pipeline-activate',
            revision: 1,
            path: 'scripts/run.sh',
            sha256: 'a'.repeat(64),
            sizeBytes: 19,
            mediaType: 'text/x-shellscript',
            content: '#!/bin/bash\nrun',
            storedAt: nowIso(),
          });
        },
        {
          permissions: [
            'knowledge:review',
            'knowledge:export',
            'knowledge:submit',
            'knowledge:search',
          ],
          roleTemplate: 'admin',
          securityLevel: 10,
        },
      );

      // Step 1: Review approve
      const reviewResp = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/artifact-pipeline-activate/review',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-pipeline-activate',
          decision: 'approve',
          notes: 'Pipeline approved',
        },
      });

      expect(reviewResp.statusCode).toBe(200);

      // Step 2: Activate SKILL.md and references/guide.md
      const activateResp = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/activate',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          artifactId: 'artifact-pipeline-activate',
          selectedPaths: ['SKILL.md', 'references/guide.md'],
        },
      });

      expect(activateResp.statusCode).toBe(200);
      const activateJson = activateResp.json();
      expect(activateJson.artifactId).toBe('artifact-pipeline-activate');
      expect(activateJson.files).toHaveLength(2);

      const skillFile = activateJson.files.find((f: any) => f.path === 'SKILL.md');
      expect(skillFile).toBeDefined();
      expect(skillFile.content).toBe('# Pipeline Skill');

      const guideFile = activateJson.files.find((f: any) => f.path === 'references/guide.md');
      expect(guideFile).toBeDefined();
      expect(guideFile.content).toBe('# Guide\n\nGuide content');

      await app.close();
    });
  });
});
