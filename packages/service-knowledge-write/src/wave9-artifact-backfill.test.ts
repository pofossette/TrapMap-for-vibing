import { describe, expect, it, vi } from 'vitest';
import type { ArtifactReadProjection } from '@trapmap/contracts';

import type { ArtifactWritePort } from './artifact-ports.js';
import { migrateSkillArtifacts } from './wave9-artifact-backfill.js';

const artifact = { id: 'artifact_1' } as never;

function readProjection(existing: boolean): ArtifactReadProjection {
  return {
    getById: vi.fn(async () => (existing ? artifact : null)),
    listByFilter: vi.fn(async () => []),
    listForRetrieval: vi.fn(async () => []),
    history: vi.fn(async () => []),
    exportArtifacts: vi.fn(async () => []),
    reviewQueue: vi.fn(async () => []),
  };
}

function writer(): ArtifactWritePort {
  return {
    nextId: vi.fn(),
    insert: vi.fn(async () => undefined),
    updateLifecycle: vi.fn(),
    appendRevision: vi.fn(),
    updateRevisionDerived: vi.fn(),
    appendLifecycleEvent: vi.fn(),
    importArtifact: vi.fn(),
    editArtifact: vi.fn(),
    review: vi.fn(),
    activate: vi.fn(),
  };
}

describe('Wave-9 artifact backfill', () => {
  it('uses owner ports idempotently and records individual failures', async () => {
    const artifacts = [artifact, { id: 'artifact_2' } as never];
    const write = writer();
    write.insert = vi.fn(async (value) => {
      if (value.id === 'artifact_2') throw new Error('insert failed');
    });
    const result = await migrateSkillArtifacts({
      artifacts,
      artifactWriter: write,
      artifactReadProjection: readProjection(false),
    });

    expect(result).toMatchObject({ totalArtifacts: 2, migrated: 1, skipped: 0 });
    expect(result.errors).toEqual([{ artifactId: 'artifact_2', error: 'insert failed' }]);
    expect(write.insert).toHaveBeenCalledTimes(2);
  });
});
