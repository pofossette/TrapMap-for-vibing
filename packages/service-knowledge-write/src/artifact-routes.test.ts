import { InvocationError } from '@trapmap/backend-core';
import {
  type AdapterName,
  type RouteTestApp,
  buildRouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
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
});
