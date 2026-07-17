import { describe, expect, it, vi } from 'vitest';

import { createCandidateCorpusPgReadPort } from './candidate-corpus-pg.js';

describe('createCandidateCorpusPgReadPort', () => {
  it('reads only approved corpus records for the requested team', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'trap-1', team_id: 'team-1', shortcut: 'short', detail: 'detail', labels: ['a'] },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'skill-1',
            team_id: 'team-1',
            title: 'skill',
            metadata: { summary: 'summary' },
            labels: ['b'],
          },
        ],
      });
    const corpus = createCandidateCorpusPgReadPort({ query } as never);

    await expect(corpus.listApprovedTraps('team-1')).resolves.toEqual([
      { id: 'trap-1', teamId: 'team-1', shortcut: 'short', detail: 'detail', labels: ['a'] },
    ]);
    await expect(corpus.listApprovedSkills('team-1')).resolves.toEqual([
      { id: 'skill-1', teamId: 'team-1', title: 'skill', summary: 'summary', keywords: ['b'] },
    ]);
    expect(query.mock.calls.map((call) => call[1])).toEqual([['team-1'], ['team-1']]);
    expect(
      query.mock.calls.every(([sql]) => String(sql).includes("lifecycle_state = 'approved'")),
    ).toBe(true);
  });
});
