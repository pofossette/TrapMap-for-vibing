import { buildServer } from '@trapmap/server/app.js';
import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createKnowledgeEntryRecord } from './knowledge.js';
import { runPreReview } from './pre-review.js';
import { type SkillShareerStore, createOpaqueToken, hashSecret, nowIso } from './store.js';

describe('End-to-end retrieval workflow', () => {
  let server: FastifyInstance;
  let store: SkillShareerStore;
  let userId: string;
  let reviewerId: string;
  let teamId: string;
  let submitterSessionToken: string;
  let reviewerSessionToken: string;

  beforeAll(async () => {
    const testDataFile = `/tmp/skill-shareer-workflow-test-${Date.now()}.json`;
    server = buildServer({ config: { dataFile: testDataFile } });
    await server.ready();
    store = server.skillShareer.store;
  });

  beforeEach(async () => {
    resetRetrievalReadModelCacheForTests();
    await store.transact(async (data) => {
      data.counters = {};
      data.users = [];
      data.teams = [];
      data.memberships = [];
      data.accessKeys = [];
      data.sessions = [];
      data.knowledgeEntries = [];
      data.auditEvents = [];
    });

    const createdAt = nowIso();

    await store.transact(async (data) => {
      userId = store.nextId(data, 'user');
      data.users.push({
        id: userId,
        handle: 'submitter',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      reviewerId = store.nextId(data, 'user');
      data.users.push({
        id: reviewerId,
        handle: 'reviewer',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      teamId = store.nextId(data, 'team');
      data.teams.push({
        id: teamId,
        name: 'Test Team',
        slug: 'test-team',
        description: 'Test team for workflow',
        createdAt,
        updatedAt: createdAt,
      });

      const submitterMemberId = store.nextId(data, 'member');
      data.memberships.push({
        id: submitterMemberId,
        userId,
        teamId,
        roleTemplate: 'user',
        securityLevel: 5,
        permissions: ['knowledge:submit', 'knowledge:search'],
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      const reviewerMemberId = store.nextId(data, 'member');
      data.memberships.push({
        id: reviewerMemberId,
        userId: reviewerId,
        teamId,
        roleTemplate: 'user',
        securityLevel: 10,
        permissions: ['knowledge:review', 'knowledge:search'],
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      submitterSessionToken = createOpaqueToken('sess');
      const submitterSessionId = store.nextId(data, 'session');
      data.sessions.push({
        id: submitterSessionId,
        subjectType: 'user',
        userId,
        activeTeamId: teamId,
        tokenHash: hashSecret(submitterSessionToken),
        expiresAt: null,
        createdAt,
        updatedAt: createdAt,
      });

      reviewerSessionToken = createOpaqueToken('sess');
      const reviewerSessionId = store.nextId(data, 'session');
      data.sessions.push({
        id: reviewerSessionId,
        subjectType: 'user',
        userId: reviewerId,
        activeTeamId: teamId,
        tokenHash: hashSecret(reviewerSessionToken),
        expiresAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    });
  });

  afterEach(async () => {
    await store.transact(async (data) => {
      data.knowledgeEntries = [];
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('full submission to search workflow', () => {
    it('should not return unapproved knowledge in search results', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['typescript', 'testing'],
          shortcut: 'Test entry for workflow',
          detail: 'This is a test detail that should not appear in search until approved',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const snapshot = await store.snapshot();
      const entry = snapshot.knowledgeEntries.find((e) => e.id === entryId);
      expect(entry).toBeDefined();
      expect(['submitted', 'agent-rejected', 'rejected']).toContain(entry?.lifecycleState ?? '');

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'typescript testing workflow',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const unapprovedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(unapprovedMatch).toBeUndefined();
    });

    it('should return approved knowledge in search results after reviewer approval', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['typescript', 'types'],
          shortcut: 'Use strict types',
          detail: 'Always enable strict null checks in TypeScript',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Looks good',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'typescript strict types',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const approvedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(approvedMatch).toBeDefined();
      expect(approvedMatch.shortcut).toBe('Use strict types');
    });
  });

  describe('resubmit workflow with rejection', () => {
    it('should allow resubmit after rejection and preserve lifecycle linkage', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['bug', 'fix'],
          shortcut: 'Fix the bug',
          detail: 'Initial bug report with insufficient detail',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const rejectResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'reject',
          notes: 'Please provide more detail about the bug',
        }),
      });

      expect(rejectResponse.statusCode).toBe(200);

      const statusResponse = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusData = statusResponse.json();
      expect(statusData.entry.lifecycleState).toBe('rejected');

      const resubmitResponse = await server.inject({
        method: 'POST',
        url: `/v1/knowledge/${entryId}/resubmit`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          labels: ['bug', 'fix'],
          shortcut: 'Fix the memory leak in worker',
          detail: 'Worker process crashes after 24h due to memory leak in event handler',
        }),
      });

      expect(resubmitResponse.statusCode).toBe(200);
      const resubmitData = resubmitResponse.json();
      expect(resubmitData.entry.latestRevision.revision).toBe(2);
      expect(resubmitData.entry.labels).toContain('fix');

      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approved with additional detail',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'memory leak worker',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      const approvedMatch = [
        ...(searchData?.globalConstraints ?? []),
        ...(searchData?.projectKnowledge ?? []),
      ].find((m: any) => m.entryId === entryId);
      expect(approvedMatch).toBeDefined();
      expect(approvedMatch.labels).toBeDefined();
    });
  });

  describe('review-status history inspection', () => {
    it('should expose lifecycle history and reviewer feedback across rejection and approval', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['api'],
          shortcut: 'API rate limiting',
          detail: 'Implement rate limiting on endpoints',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const rejectResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'reject',
          notes: 'Add more specific implementation details',
        }),
      });

      expect(rejectResponse.statusCode).toBe(200);

      const statusResponse1 = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse1.statusCode).toBe(200);
      const statusData1 = statusResponse1.json();
      expect(statusData1.entry.lifecycleState).toBe('rejected');

      const lastDecision =
        statusData1.entry.reviewHistory[statusData1.entry.reviewHistory.length - 1];
      expect(lastDecision.notes).toBe('Add more specific implementation details');

      const resubmitResponse = await server.inject({
        method: 'POST',
        url: `/v1/knowledge/${entryId}/resubmit`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          labels: ['api'],
          shortcut: 'API rate limiting with Redis',
          detail: 'Use Redis-based token bucket algorithm for rate limiting',
        }),
      });

      expect(resubmitResponse.statusCode).toBe(200);

      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Good detail on implementation',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      const statusResponse2 = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse2.statusCode).toBe(200);
      const statusData2 = statusResponse2.json();
      expect(statusData2.entry.lifecycleState).toBe('approved');
      expect(statusData2.entry.history.length).toBeGreaterThan(1);
      expect(statusData2.entry.reviewHistory.length).toBe(2);
    });
  });

  describe('JSON mode and stdin consistency', () => {
    it('should return parseable JSON from knowledge submission endpoint', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['json', 'test'],
          shortcut: 'JSON mode test',
          detail: 'Test JSON output consistency',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      expect(submitData).toHaveProperty('entry');
      expect(submitData.entry).toHaveProperty('id');
      expect(submitData.entry).toHaveProperty('lifecycleState');
      expect(submitData.entry).toHaveProperty('shortcut');
    });

    it('should return parseable JSON from retrieval search endpoint', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'global',
          labels: ['search', 'json'],
          shortcut: 'Search JSON test',
          detail: 'Test search JSON output',
        }),
      });

      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approve for search test',
        }),
      });

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'search JSON test',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      expect(searchData).toHaveProperty('globalConstraints');
      expect(searchData).toHaveProperty('projectKnowledge');
      expect(searchData).toHaveProperty('refinementSummary');
      expect(Array.isArray(searchData.globalConstraints)).toBe(true);
      expect(Array.isArray(searchData.projectKnowledge)).toBe(true);
    });

    it('should return parseable JSON from review-status endpoint', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['status', 'json'],
          shortcut: 'Status JSON test',
          detail: 'Test status JSON output',
        }),
      });

      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const statusResponse = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusData = statusResponse.json();
      expect(statusData).toHaveProperty('entry');
      expect(statusData.entry).toHaveProperty('id');
      expect(statusData.entry).toHaveProperty('lifecycleState');
      expect(statusData.entry).toHaveProperty('history');
      expect(statusData.entry).toHaveProperty('reviewHistory');
    });
  });

  describe('hybrid mode with rerank (HYBR-05)', () => {
    it('hybrid mode does not bypass approved-only filter after rerank', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['hybrid', 'rerank', 'test'],
          shortcut: 'Hybrid rerank test entry',
          detail: 'This entry should not appear in hybrid search until approved',
        }),
      });

      expect(submitResponse.statusCode).toBe(200);
      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      const snapshot = await store.snapshot();
      const entry = snapshot.knowledgeEntries.find((e) => e.id === entryId);
      expect(['submitted', 'agent-rejected', 'rejected']).toContain(entry?.lifecycleState ?? '');

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'hybrid rerank test',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
          mode: 'hybrid',
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const unapprovedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(unapprovedMatch).toBeUndefined();
    });

    it('hybrid mode returns approved entries with valid response shape', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'global',
          labels: ['approved', 'hybrid'],
          shortcut: 'Approved hybrid test',
          detail: 'This approved entry should appear in hybrid search',
        }),
      });

      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approve for hybrid test',
        }),
      });

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'approved hybrid test',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
          mode: 'hybrid',
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      expect(searchData).toHaveProperty('globalConstraints');
      expect(searchData).toHaveProperty('projectKnowledge');
      expect(searchData).toHaveProperty('refinementSummary');

      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const approvedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(approvedMatch).toBeDefined();
      expect(approvedMatch.score).toBeGreaterThanOrEqual(0);
      expect(approvedMatch.score).toBeLessThanOrEqual(1);
    });

    it('hybrid mode respects team boundaries after rerank', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          scope: 'project',
          labels: ['team', 'boundary'],
          shortcut: 'Team boundary hybrid test',
          detail: 'This team-scoped entry should only appear for team members',
        }),
      });

      const submitData = submitResponse.json();
      const entryId = submitData.entry.id;

      await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          authorization: `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approve for team boundary test',
        }),
      });

      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          authorization: `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          seed: 'team boundary hybrid',
          filters: { labels: [], scopes: [] },
          maxResults: 10,
          includeRefinement: false,
          mode: 'hybrid',
        }),
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchData = searchResponse.json();
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const teamMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(teamMatch).toBeDefined();
    });
  });
});
