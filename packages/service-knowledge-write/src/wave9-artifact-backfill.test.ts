import { describe, expect, it, vi } from 'vitest';

import type { ArtifactWritePort } from './artifact-ports.js';
import { migrateSkillArtifacts } from './wave9-artifact-backfill.js';
import { createArtifactReadProjectionFixture } from './test-helpers.js';

const artifact = { id: 'artifact_1', title: 'snapshot artifact' } as never;

function writer(): ArtifactWritePort {
  return {
    nextId: vi.fn(),
    insert: vi.fn(async () => undefined),
    updateLifecycle: vi.fn(),
    appendRevision: vi.fn(),
    updateRevisionDerived: vi.fn(),
    appendLifecycleEvent: vi.fn(),
    editArtifact: vi.fn(),
    review: vi.fn(),
    activate: vi.fn(),
  };
}

describe('Wave-9 artifact backfill', () => {
  it('verifies an inserted artifact by exact owner readback', async () => {
    const records = new Map<string, typeof artifact>();
    const write = writer();
    write.insert = vi.fn(async (value) => {
      records.set(value.id, value as typeof artifact);
    });
    const result = await migrateSkillArtifacts({
      artifacts: [artifact],
      artifactWriter: write,
      artifactReadProjection: createArtifactReadProjectionFixture(
        vi.fn(async (id) => records.get(id) ?? null),
      ),
    });

    expect(result).toMatchObject({ totalArtifacts: 1, migrated: 1, skipped: 0, verified: 1 });
    expect(result.errors).toEqual([]);
  });

  it('rejects a same-ID destination artifact whose payload differs', async () => {
    const existing = { ...artifact, title: 'different artifact' } as never;
    const write = writer();
    const result = await migrateSkillArtifacts({
      artifacts: [artifact],
      artifactWriter: write,
      artifactReadProjection: createArtifactReadProjectionFixture(vi.fn(async () => existing)),
    });

    expect(write.insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ migrated: 0, skipped: 0, verified: 0 });
    expect(result.errors).toEqual([
      { artifactId: 'artifact_1', error: 'destination artifact differs from snapshot' },
    ]);
  });
});
