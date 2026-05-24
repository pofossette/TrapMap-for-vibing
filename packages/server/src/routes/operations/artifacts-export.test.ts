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

  describe('POST /v1/operations/export', () => {
    it('returns 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.code).toBeDefined();
    });

    it('accepts valid export request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {
          teamId: null,
          includeHistory: true,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts export request without body (uses defaults)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/export',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('artifact export (IMEX-02)', () => {
    it('returns 401 for unauthenticated artifact export request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'bundle-json',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid artifact export request schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'bundle-json',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts distilled-json format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'distilled-json',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts skill-dir format (server normalizes to bundle-json)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
          format: 'skill-dir',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('defaults format to bundle-json when not specified', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        payload: {
          artifactId: 'artifact_1',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

// =============================================================================
// Phase 2: Route/service main link integration tests (artifact export)
// =============================================================================

const FAKE_HASH = 'a'.repeat(64);

function seedApprovedArtifactWithFiles(
  data: { skillArtifacts: any[]; counters: Record<string, number>; artifactFilePayloads?: any[] },
  userId: string,
  overrides: {
    id?: string;
    title?: string;
    labels?: string[];
    scope?: string;
    files?: { path: string; content: string; kind: string }[];
    withClientManifest?: boolean;
    withDerived?: boolean;
  } = {},
) {
  const id = overrides.id ?? `artifact_export_${Date.now()}`;
  const title = overrides.title ?? `Export Test ${id}`;
  const labels = overrides.labels ?? ['test', 'export'];
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
          includeInDerivation: f.kind === 'skill-markdown' || f.kind === 'reference',
          activationOnly: f.kind !== 'skill-markdown' && f.kind !== 'reference',
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

  const derived = overrides.withDerived !== false ? {
    profile: {
      artifactId: id,
      revision: 1,
      sourceHash: FAKE_HASH,
      title,
      summary: `Summary for ${title}`,
      keywords: labels,
      referencePaths: files
        .filter((f: any) => f.kind === 'reference')
        .map((f: any) => f.path),
      contentHash: FAKE_HASH,
    },
    capsules: [
      {
        capsuleId: `capsule_${id}`,
        artifactId: id,
        revision: 1,
        sourcePaths: ['SKILL.md'],
        content: `Content for ${title}`,
        situation: `When working with ${title}`,
        problem: `Problem with ${title}`,
        goal: `Goal for ${title}`,
        errorText: null,
        labels,
        scope,
        requiredLevel: 0,
      },
    ],
    clientManifest: overrides.withClientManifest
      ? {
          artifactId: id,
          revision: 1,
          references: files
            .filter((f: any) => f.kind === 'reference')
            .map((f: any) => ({
              path: f.path,
              sha256: FAKE_HASH,
              sizeBytes: f.sizeBytes,
              mediaType: 'text/markdown',
            })),
          assets: files
            .filter((f: any) => f.kind === 'asset')
            .map((f: any) => ({
              path: f.path,
              sha256: FAKE_HASH,
              sizeBytes: f.sizeBytes,
              mediaType: f.path.endsWith('.yml') ? 'application/x-yaml' : 'application/octet-stream',
            })),
          scripts: files
            .filter((f: any) => f.kind === 'script')
            .map((f: any) => ({
              path: f.path,
              sha256: FAKE_HASH,
              sizeBytes: f.sizeBytes,
              mediaType: 'text/x-shellscript',
              capability: `Script: ${f.path}`,
              argsSchemaSummary: '',
              sideEffectSummary: '',
              defaultPolicy: 'manual',
            })),
        }
      : null,
    sourceHash: FAKE_HASH,
    derivedAt: nowIso(),
  } : null;

  const revision = {
    revision: 1,
    sourceHash: FAKE_HASH,
    files,
    submittedAt: nowIso(),
    submittedByUserId: userId,
    scriptDescriptors: [],
    derived,
  };

  data.skillArtifacts.push({
    id,
    teamId: null,
    scope,
    labels,
    title,
    slug: `export-${id}`,
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

describe('artifact export main link tests (Phase 2)', () => {
  describe('bundle-json export', () => {
    it('returns 404 for non-existent artifact', async () => {
      const { app, authToken } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'nonexistent', format: 'bundle-json' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('exports an approved artifact in bundle-json format with files and content', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedArtifactWithFiles(data, auth.userId, {
            id: 'artifact-export-bundle',
            title: 'Bundle Export Test',
            files: [
              { path: 'SKILL.md', content: '# Skill Title\n\nSkill body content', kind: 'skill-markdown' },
              { path: 'references/setup.md', content: '# Setup\n\nSetup instructions', kind: 'reference' },
              { path: 'assets/logo.png', content: 'fake-png-content', kind: 'asset' },
            ],
            withClientManifest: true,
          });

          seedFilePayload(data, 'artifact-export-bundle', 1, 'SKILL.md', '# Skill Title\n\nSkill body content');
          seedFilePayload(data, 'artifact-export-bundle', 1, 'references/setup.md', '# Setup\n\nSetup instructions');
          seedFilePayload(data, 'artifact-export-bundle', 1, 'assets/logo.png', 'fake-png-content');
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-export-bundle', format: 'bundle-json' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.format).toBe('bundle-json');
      expect(json.bundle).toBeDefined();
      expect(json.bundle.title).toBe('Bundle Export Test');
      expect(json.bundle.files).toHaveLength(3);

      const skillMd = json.bundle.files.find((f: any) => f.path === 'SKILL.md');
      expect(skillMd).toBeDefined();
      expect(skillMd.kind).toBe('skill-markdown');
      expect(skillMd.content).toContain('Skill body content');

      const refFile = json.bundle.files.find((f: any) => f.path === 'references/setup.md');
      expect(refFile).toBeDefined();
      expect(refFile.kind).toBe('reference');

      await app.close();
    });

    it('exports bundle-json with script descriptors', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedArtifactWithFiles(data, auth.userId, {
            id: 'artifact-export-scripts',
            title: 'Script Export Test',
            files: [
              { path: 'SKILL.md', content: '# Script Skill', kind: 'skill-markdown' },
              { path: 'scripts/deploy.sh', content: '#!/bin/bash\necho deploy', kind: 'script' },
            ],
            withDerived: true,
          });

          seedFilePayload(data, 'artifact-export-scripts', 1, 'SKILL.md', '# Script Skill');
          seedFilePayload(data, 'artifact-export-scripts', 1, 'scripts/deploy.sh', '#!/bin/bash\necho deploy');

          // Add script descriptor to the artifact
          const artifact = data.skillArtifacts.find((a: any) => a.id === 'artifact-export-scripts');
          if (artifact) {
            artifact.latestRevision.scriptDescriptors = [
              {
                path: 'scripts/deploy.sh',
                sha256: FAKE_HASH,
                sizeBytes: 26,
                mediaType: 'text/x-shellscript',
                capability: 'Deployment script',
                argsSchemaSummary: '--env=production',
                sideEffectSummary: 'Deploys to production',
                defaultPolicy: 'needs-approval',
              },
            ];
          }
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-export-scripts', format: 'bundle-json' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.bundle.scriptDescriptors).toBeDefined();
      expect(json.bundle.scriptDescriptors.length).toBeGreaterThanOrEqual(1);
      expect(json.bundle.scriptDescriptors[0].path).toBe('scripts/deploy.sh');
      expect(json.bundle.scriptDescriptors[0].capability).toBe('Deployment script');

      await app.close();
    });
  });

  describe('distilled-json export', () => {
    it('exports distilled projection from cached derived outputs', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedArtifactWithFiles(data, auth.userId, {
            id: 'artifact-export-distilled',
            title: 'Distilled Export Test',
            labels: ['distilled', 'test'],
            files: [
              { path: 'SKILL.md', content: '# Distilled Skill', kind: 'skill-markdown' },
              { path: 'references/guide.md', content: '# Guide\n\nReference content', kind: 'reference' },
            ],
            withClientManifest: true,
          });

          seedFilePayload(data, 'artifact-export-distilled', 1, 'SKILL.md', '# Distilled Skill');
          seedFilePayload(data, 'artifact-export-distilled', 1, 'references/guide.md', '# Guide\n\nReference content');
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-export-distilled', format: 'distilled-json' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.format).toBe('distilled-json');
      expect(json.bundle).toBeNull();
      expect(json.distilled).toBeDefined();
      expect(json.distilled.artifactId).toBe('artifact-export-distilled');
      expect(json.distilled.title).toBe('Distilled Export Test');
      expect(json.distilled.labels).toContain('distilled');
      expect(json.distilled.sourceKind).toBe('skill-directory');
      expect(json.distilled.profile).toBeDefined();
      expect(json.distilled.capsules).toBeDefined();
      expect(json.distilled.capsules.length).toBeGreaterThanOrEqual(1);

      await app.close();
    });
  });

  describe('governance enforcement', () => {
    it('blocks export for artifact above user security level', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedApprovedArtifactWithFiles(data, auth.userId, {
            id: 'artifact-high-level',
            title: 'High Level Export Test',
          });
          const artifact = data.skillArtifacts.find((a: any) => a.id === 'artifact-high-level');
          if (artifact) {
            artifact.requiredLevel = 10;
          }
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'user',
          securityLevel: 5,
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-high-level', format: 'bundle-json' },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  describe('export with boundary, maintenanceMeta, and agentReview', () => {
    function seedArtifactWithGovernance(
      data: any,
      userId: string,
      id: string,
      title: string,
    ) {
      seedApprovedArtifactWithFiles(data, userId, {
        id,
        title,
        files: [
          { path: 'SKILL.md', content: `# ${title}\n\nBody content`, kind: 'skill-markdown' },
        ],
        withDerived: true,
      });

      seedFilePayload(data, id, 1, 'SKILL.md', `# ${title}\n\nBody content`);

      // Attach boundary
      const artifact = data.skillArtifacts.find((a: any) => a.id === id);
      if (artifact) {
        artifact.boundary = {
          context: ['backend', 'staging'],
          versions: [{ package: 'node', range: '>=18.0.0', note: 'Node 18 LTS' }],
          prerequisites: [{ description: 'PostgreSQL 15+', kind: 'service', required: true }],
          signals: [{ pattern: 'connection pool', kind: 'keyword', description: 'DB pool config' }],
          exclusions: [{ description: 'Not applicable for serverless', kind: 'platform' }],
          evidence: [{ kind: 'documentation', identifier: 'node-docs', url: 'https://nodejs.org', note: 'Official docs' }],
        };

        artifact.maintenanceMeta = {
          assignees: [{ userId, role: 'owner' }],
          reviewCycle: 'monthly',
          lastReviewedAt: null,
        };

        artifact.agentReview = {
          status: 'approved',
          evaluatedAt: nowIso(),
          evaluatorModel: 'test-model',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'medium',
          notes: 'Agent review passed all checks',
        };
      }
    }

    it('exports artifact with boundary metadata preserved', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithGovernance(data, auth.userId, 'artifact-boundary-export', 'Boundary Export');
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-boundary-export', format: 'distilled-json' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.distilled).toBeDefined();
      expect(json.distilled.title).toBe('Boundary Export');
      expect(json.distilled.sourceKind).toBe('skill-directory');

      await app.close();
    });

    it('exports artifact with maintenanceMeta and agentReview and preserves them in history view', async () => {
      const { app, authToken } = await buildTestServer(
        (data, auth) => {
          seedArtifactWithGovernance(data, auth.userId, 'artifact-gov-export', 'Governance Export');
        },
        {
          permissions: ['knowledge:export'],
          roleTemplate: 'admin',
        },
      );

      // Export in bundle-json format
      const exportResp = await app.inject({
        method: 'POST',
        url: '/v1/operations/artifacts/export',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { artifactId: 'artifact-gov-export', format: 'bundle-json' },
      });

      expect(exportResp.statusCode).toBe(200);
      const exportJson = exportResp.json();
      expect(exportJson.bundle).toBeDefined();
      expect(exportJson.bundle.title).toBe('Governance Export');
      expect(exportJson.bundle.files).toHaveLength(1);
      expect(exportJson.bundle.files[0].path).toBe('SKILL.md');
      expect(exportJson.bundle.files[0].content).toContain('Body content');

      // Check history via the history endpoint
      const historyResp = await app.inject({
        method: 'GET',
        url: '/v1/operations/artifacts/artifact-gov-export/history?artifactId=artifact-gov-export',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(historyResp.statusCode).toBe(200);
      const historyJson = historyResp.json();
      expect(historyJson.artifactId).toBe('artifact-gov-export');
      expect(historyJson.title).toBe('Governance Export');
      expect(historyJson.revisions).toBeDefined();
      expect(historyJson.revisions.length).toBeGreaterThanOrEqual(1);
      expect(historyJson.revisions[0].revision).toBe(1);

      await app.close();
    });
  });
});
