import { InvocationError } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { ArtifactWritePort } from './artifact-ports.js';
import { registerArtifactRoutes } from './artifact-routes.js';
import { createArtifactReadProjectionFixture } from './test-helpers.js';

function createArtifacts(): ArtifactWritePort {
  return {
    nextId: vi.fn(),
    insert: vi.fn(),
    updateLifecycle: vi.fn(),
    appendRevision: vi.fn(),
    updateRevisionDerived: vi.fn(),
    appendLifecycleEvent: vi.fn(),
    importArtifact: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    editArtifact: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    review: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    activate: vi.fn(async () => ({ id: 'artifact-1' }) as never),
  };
}

async function createArtifactRouteApp() {
  const artifacts = createArtifacts();
  const app = Fastify();
  registerArtifactRoutes(app, artifacts, createArtifactReadProjectionFixture());
  await app.ready();
  return { app, artifacts };
}

describe('artifact owner routes', () => {
  it('rejects mutations without a trusted actor header', async () => {
    const { app, artifacts } = await createArtifactRouteApp();

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
    const { app, artifacts } = await createArtifactRouteApp();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/artifact-1/deactivate',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: { actorId: 'spoofed-user' },
    });

    expect(response.statusCode).toBe(403);
    expect(artifacts.updateLifecycle).not.toHaveBeenCalled();
    await app.close();
  });

  it('preserves canonical unavailable invocation errors', async () => {
    const artifacts = createArtifacts();
    artifacts.importArtifact = vi.fn(async () => {
      throw InvocationError.unavailable('artifact owner unavailable');
    });
    const app = Fastify();
    registerArtifactRoutes(app, artifacts, createArtifactReadProjectionFixture());
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/import',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'artifact owner unavailable', kind: 'unavailable' });
    await app.close();
  });
});
