import { InvocationError } from '@trapmap/backend-core';
import {
  type AdapterName,
  type RouteTestApp,
  buildRouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
import type { SkillArtifact, SkillArtifactRevision } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ArtifactBundleImportPort, ArtifactWritePort } from './artifact-ports.js';
import { createArtifactRouteDefs } from './artifact-routes.js';
import { createArtifactReadProjectionFixture } from './test-helpers.js';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

function createArtifacts(): ArtifactWritePort {
  return {
    nextId: vi.fn(),
    insert: vi.fn(),
    updateLifecycle: vi.fn(),
    appendRevision: vi.fn(),
    updateRevisionDerived: vi.fn(),
    appendLifecycleEvent: vi.fn(),
    editArtifact: vi.fn(async () => ({ id: 'artifact-1' })),
    review: vi.fn(async () => ({ id: 'artifact-1' })),
    activate: vi.fn(async () => ({ id: 'artifact-1' })),
  };
}

function createImporter(): ArtifactBundleImportPort {
  return {
    importBundle: vi.fn(async () => ({ id: 'artifact_1', title: 'Imported skill' })),
  };
}

async function createArtifactRouteApp(
  adapter: AdapterName,
  importer = createImporter(),
): Promise<{
  app: RouteTestApp;
  artifacts: ArtifactWritePort;
  importer: ArtifactBundleImportPort;
}> {
  const artifacts = createArtifacts();
  const deps = {
    artifacts,
    readProjection: createArtifactReadProjectionFixture(),
    importer,
  };
  const app = await buildRouteTestApp(createArtifactRouteDefs(deps), deps, adapter);
  return { app, artifacts, importer };
}

function createRevision(overrides: Partial<SkillArtifactRevision> = {}): SkillArtifactRevision {
  return {
    revision: 1,
    sourceHash: 'a'.repeat(64),
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256: 'a'.repeat(64),
        sizeBytes: 120,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      },
    ],
    scriptDescriptors: [],
    derived: null,
    submittedAt: '2026-05-01T10:00:00Z',
    submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 0 },
    ...overrides,
  };
}

function createArtifact(overrides: Partial<SkillArtifact> = {}): SkillArtifact {
  return {
    id: 'artifact-1',
    teamId: null,
    scope: 'global',
    labels: ['skill'],
    title: 'Docker Troubleshooting',
    slug: 'docker-troubleshooting',
    requiredLevel: 0,
    lifecycleState: 'approved',
    owner: { id: 'user-1', handle: 'alice', securityLevel: 0 },
    latestRevision: 2,
    history: [
      createRevision({ revision: 1, version: '1.0.0', sourceHash: 'b'.repeat(64) }),
      createRevision({ revision: 2, version: '2.1.0', sourceHash: 'c'.repeat(64) }),
    ],
    metadata: {
      sourceKind: 'single-skill-md',
      latestDecision: null,
      latestReviewedAt: null,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      resubmissionCount: 0,
      revisionCount: 2,
      submissionCount: 2,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundaryMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
    ...overrides,
  };
}

describe.each(ADAPTERS)('artifact owner routes (%s adapter)', (adapter) => {
  it('rejects mutations without a trusted actor header', async () => {
    const { app, artifacts } = await createArtifactRouteApp(adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/artifact-1/deactivate',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(artifacts.updateLifecycle).not.toHaveBeenCalled();
    await app.close();
  });

  it('uses the trusted actor header and rejects a spoofed body actor', async () => {
    const { app, artifacts } = await createArtifactRouteApp(adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/artifact-1/deactivate',
      headers: { 'x-trapmap-actor-id': 'trusted-user', 'x-trapmap-security-level': '1' },
      payload: { actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(artifacts.updateLifecycle).not.toHaveBeenCalled();
    await app.close();
  });

  it('imports canonical bundles through the owner importer and returns batch results', async () => {
    const { app, importer } = await createArtifactRouteApp(adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/import',
      headers: { 'x-trapmap-actor-id': 'trusted-user', 'x-trapmap-security-level': '1' },
      payload: {
        bundles: [
          {
            scope: 'project',
            labels: ['skill'],
            title: 'Imported skill',
            slug: 'imported-skill',
            requiredLevel: 1,
            sourceKind: 'single-skill-md',
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown',
                sha256: 'a'.repeat(64),
                sizeBytes: 4,
                mediaType: 'text/markdown',
                source: 'SKILL.md',
                includeInDerivation: true,
                activationOnly: false,
                content: 'body',
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      importedCount: 1,
      failedCount: 0,
      results: [
        {
          success: true,
          artifactId: 'artifact_1',
          title: 'Imported skill',
          error: null,
          sourceKind: 'single-skill-md',
        },
      ],
    });
    expect(importer.importBundle).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Imported skill' }),
      expect.objectContaining({ actorId: 'trusted-user' }),
    );
    await app.close();
  });

  it('preserves canonical unavailable invocation errors', async () => {
    const artifacts = createArtifacts();
    const importer = createImporter();
    importer.importBundle = vi.fn(async () => {
      throw InvocationError.unavailable('artifact owner unavailable');
    });
    const deps = {
      artifacts,
      readProjection: createArtifactReadProjectionFixture(),
      importer,
    };
    const app = await buildRouteTestApp(createArtifactRouteDefs(deps), deps, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/import',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: {
        bundles: [
          {
            scope: 'project',
            labels: ['skill'],
            title: 'Unavailable skill',
            slug: 'unavailable-skill',
            requiredLevel: 0,
            sourceKind: 'single-skill-md',
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown',
                sha256: 'a'.repeat(64),
                sizeBytes: 4,
                mediaType: 'text/markdown',
                source: 'SKILL.md',
                includeInDerivation: true,
                activationOnly: false,
                content: 'body',
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'artifact owner unavailable',
      kind: 'unavailable',
    });
    await app.close();
  });

  it('returns the object-shaped skill history response with revision summaries', async () => {
    const getById = vi.fn(async () => createArtifact());
    const history = vi.fn(async () => [
      createRevision({ revision: 1, version: '1.0.0', sourceHash: 'b'.repeat(64) }),
      createRevision({
        revision: 2,
        version: '2.1.0',
        sourceHash: 'c'.repeat(64),
        submittedAt: '2026-05-09T10:00:00Z',
        submittedBy: { id: 'user-2', handle: 'bob', securityLevel: 0 },
      }),
    ]);
    const artifacts = createArtifacts();
    const importer = createImporter();
    const deps = {
      artifacts,
      readProjection: createArtifactReadProjectionFixture(getById, history),
      importer,
    };
    const app = await buildRouteTestApp(createArtifactRouteDefs(deps), deps, adapter);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/artifacts/artifact-1/history',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      artifactId: 'artifact-1',
      title: 'Docker Troubleshooting',
      currentRevision: 2,
      lifecycleState: 'approved',
      revisions: [
        {
          revision: 1,
          submittedAt: '2026-05-01T10:00:00Z',
          submittedBy: { id: 'user-1', handle: 'alice', securityLevel: 0 },
          lifecycleState: 'approved',
          version: '1.0.0',
          sourceHash: 'b'.repeat(64),
        },
        {
          revision: 2,
          submittedAt: '2026-05-09T10:00:00Z',
          submittedBy: { id: 'user-2', handle: 'bob', securityLevel: 0 },
          lifecycleState: 'approved',
          version: '2.1.0',
          sourceHash: 'c'.repeat(64),
        },
      ],
    });
    await app.close();
  });

  it('returns 404 when the artifact for the history route is missing', async () => {
    const artifacts = createArtifacts();
    const importer = createImporter();
    const deps = {
      artifacts,
      readProjection: createArtifactReadProjectionFixture(),
      importer,
    };
    const app = await buildRouteTestApp(createArtifactRouteDefs(deps), deps, adapter);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/artifacts/unknown/history',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'Artifact not found', kind: 'not-found' });
    await app.close();
  });
});
