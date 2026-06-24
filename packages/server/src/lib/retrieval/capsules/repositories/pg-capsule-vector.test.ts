import { describe, expect, it, vi } from 'vitest';

import { ensureCapsuleVectorIndex } from './pg-capsule-vector.js';

describe('ensureCapsuleVectorIndex', () => {
  it('skips index creation when the capsule embeddings table is absent', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ regclass: null }] });
    const pool = { query } as unknown as Parameters<typeof ensureCapsuleVectorIndex>[0];

    await expect(ensureCapsuleVectorIndex(pool)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('creates the index when the capsule embeddings table exists', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ regclass: 'skill_artifact_capsule_embeddings' }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = { query } as unknown as Parameters<typeof ensureCapsuleVectorIndex>[0];

    await expect(ensureCapsuleVectorIndex(pool)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
