import { InvocationError } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { ArtifactWritePort } from './artifact-ports.js';
import { registerArtifactRoutes } from './artifact-routes.js';

function createArtifacts(): ArtifactWritePort {
  return {
    nextId: vi.fn(),
    insert: vi.fn(),
    getById: vi.fn(async () => null),
    updateLifecycle: vi.fn(),
    appendRevision: vi.fn(),
    updateRevisionDerived: vi.fn(),
    appendLifecycleEvent: vi.fn(),
    importArtifact: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    editArtifact: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    history: vi.fn(async () => []),
    exportArtifacts: vi.fn(async () => []),
    reviewQueue: vi.fn(async () => []),
    review: vi.fn(async () => ({ id: 'artifact-1' }) as never),
    activate: vi.fn(async () => ({ id: 'artifact-1' }) as never),
  };
}

describe('artifact owner routes', () => {
  it('preserves canonical unavailable invocation errors', async () => {
    const artifacts = createArtifacts();
    artifacts.importArtifact = vi.fn(async () => {
      throw InvocationError.unavailable('artifact owner unavailable');
    });
    const app = Fastify();
    registerArtifactRoutes(app, artifacts);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/artifacts/import',
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'artifact owner unavailable', kind: 'unavailable' });
    await app.close();
  });
});
