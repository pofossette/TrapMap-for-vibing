import { describe, expect, it } from 'vitest';

import { createAllRepos } from './index.js';

function createRepos(extra: Record<string, unknown> = {}) {
  const graphIndex = {
    insert: async () => undefined,
    getById: async () => null,
    listBySource: async () => [],
    listAll: async () => [],
    upsert: async () => undefined,
    remove: async () => undefined,
    removeBySource: async () => undefined,
  };
  return createAllRepos({
    graphIndex,
    artifactReadProjection: { getById: async () => null } as never,
    knowledgeOwner: { getById: async () => null } as never,
    ...extra,
  } as never);
}

describe('createAllRepos', () => {
  it('excludes identity and audit repositories owned by the injected host bundle', async () => {
    const repos = await createRepos();

    expect(repos).toHaveProperty('knowledge');
    expect(repos).toHaveProperty('artifact');
    expect(repos).toHaveProperty('usageAnalytics');
    expect(repos).toHaveProperty('graphIndex');
    expect(repos).not.toHaveProperty('feedback');
    expect(repos).not.toHaveProperty('conflict');

    expect(repos).not.toHaveProperty('session');
    expect(repos).not.toHaveProperty('accessKey');
    expect(repos).not.toHaveProperty('team');
    expect(repos).not.toHaveProperty('membership');
    expect(repos).not.toHaveProperty('user');
    expect(repos).not.toHaveProperty('audit');
    expect(Object.keys(repos)).toHaveLength(4);
  });

  it('each property is an object with expected methods', async () => {
    const repos = await createRepos();

    // Spot-check: knowledge has getById
    expect(typeof repos.knowledge.getById).toBe('function');
    // Spot-check: graphIndex has upsert
    expect(typeof repos.graphIndex.upsert).toBe('function');
  });

  it('provides the host-independent usageAnalytics projection', async () => {
    // Should NOT throw
    const repos = await createRepos();

    expect(repos.usageAnalytics).toBeDefined();
    expect(typeof repos.usageAnalytics.recordEvent).toBe('function');
    expect(typeof repos.usageAnalytics.recordEvents).toBe('function');
    expect(typeof repos.usageAnalytics.queryUsageTimeSeries).toBe('function');
    expect(typeof repos.usageAnalytics.queryHitRanking).toBe('function');
    expect(typeof repos.usageAnalytics.querySystemSummary).toBe('function');
    expect(typeof repos.usageAnalytics.archiveOldEvents).toBe('function');
  });

  it('usageAnalytics fallback returns empty results for queries', async () => {
    const repos = await createRepos();

    const timeSeries = await repos.usageAnalytics.queryUsageTimeSeries({
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
      granularity: 'day',
    });
    expect(timeSeries).toEqual([]);

    const hitRanking = await repos.usageAnalytics.queryHitRanking({
      limit: 10,
    });
    expect(hitRanking).toEqual([]);

    const summary = await repos.usageAnalytics.querySystemSummary({});
    expect(summary).toEqual({
      totalEvents: 0,
      uniqueQueries: 0,
      uniqueTeams: 0,
      uniqueAccounts: 0,
    });

    const archived = await repos.usageAnalytics.archiveOldEvents(30);
    expect(archived).toEqual({ archivedCount: 0 });
  });

  it('usageAnalytics fallback recordEvent is a no-op', async () => {
    const repos = await createRepos();

    // Should not throw
    await repos.usageAnalytics.recordEvent({
      queryId: 'q1',
      teamId: null,
      accountId: 'acc1',
      entryType: 'trap',
      entryId: 'entry1',
    });

    await repos.usageAnalytics.recordEvents([
      {
        queryId: 'q2',
        teamId: null,
        accountId: 'acc1',
        entryType: 'skill',
        entryId: 'entry2',
      },
    ]);
  });

  it('preserves the host-injected governance retrieval projection', async () => {
    const governanceRetrievalProjection = {
      listFeedback: async () => [],
      listConflicts: async () => [],
    };
    const repos = await createRepos({ governanceRetrievalProjection });

    expect(repos.governanceRetrievalProjection).toBe(governanceRetrievalProjection);
  });
});
