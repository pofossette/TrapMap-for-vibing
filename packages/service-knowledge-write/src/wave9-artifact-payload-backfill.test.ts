import { describe, expect, it, vi } from 'vitest';

import {
  migrateArtifactFilePayloads,
  type ArtifactFilePayloadOwner,
} from './wave9-artifact-payload-backfill.js';

const payload = {
  artifactId: 'artifact_legacy_1',
  revision: 1,
  path: 'SKILL.md',
  sha256: 'a'.repeat(64),
  sizeBytes: 24,
  mediaType: 'text/markdown',
  content: '# Legacy skill\n\nUse safely.',
  storedAt: '2026-07-21T00:00:00.000Z',
};

function createOwner(): ArtifactFilePayloadOwner {
  const records = new Map<string, typeof payload>();
  const key = (record: Pick<typeof payload, 'artifactId' | 'revision' | 'path'>) =>
    `${record.artifactId}:${record.revision}:${record.path}`;
  return {
    put: vi.fn(async (record) => {
      records.set(key(record), record);
    }),
    get: vi.fn(
      async (artifactId, revision, path) =>
        records.get(`${artifactId}:${revision}:${path}`) ?? null,
    ),
  };
}

describe('Wave-9 artifact file payload backfill', () => {
  it('preserves content and verifies an idempotent rerun', async () => {
    const owner = createOwner();

    const first = await migrateArtifactFilePayloads({ owner, payloads: [payload] });

    expect(first).toEqual({ migrated: 1, skipped: 0, errors: [], verified: 1 });
    await expect(owner.get(payload.artifactId, payload.revision, payload.path)).resolves.toEqual(
      payload,
    );
    await expect(migrateArtifactFilePayloads({ owner, payloads: [payload] })).resolves.toEqual({
      migrated: 0,
      skipped: 1,
      errors: [],
      verified: 1,
    });
  });
});
