import { describe, expect, it, vi } from 'vitest';

import { readLegacySnapshot } from '../legacy-snapshot-source.js';

function data() {
  return {
    counters: {},
    users: [],
    teams: [],
    memberships: [],
    accessKeys: [],
    sessions: [],
    auditEvents: [],
    knowledgeEntries: [],
    skillArtifacts: [],
    artifactFilePayloads: [],
    candidateSubmissions: [],
    duplicateCases: [],
    entityLineage: [],
    conflicts: [],
    feedbackQueue: [],
    graphIndexDocuments: [],
    promptVersion: null,
    rebuildState: null,
  };
}

describe('legacy snapshot source reader', () => {
  it('reads the singleton JSONB payload once without importing a compatibility store', async () => {
    const query = vi.fn(async () => ({ rows: [{ data: data() }] }));

    await expect(readLegacySnapshot({ query })).resolves.toEqual(data());

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT data FROM store_snapshot WHERE key = $1', ['main']);
  });

  it('rejects a legacy row that omits a required backfill bucket', async () => {
    const incomplete = data();
    delete (incomplete as Partial<typeof incomplete>).feedbackQueue;

    await expect(
      readLegacySnapshot({ query: vi.fn(async () => ({ rows: [{ data: incomplete }] })) }),
    ).rejects.toThrow('feedbackQueue');
  });
});
