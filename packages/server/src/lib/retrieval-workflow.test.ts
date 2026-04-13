import { describe, expect, it, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { buildServer } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { JsonStore, nowIso, hashSecret, createOpaqueToken } from './store.js';
import { createKnowledgeEntryRecord } from './knowledge.js';
import { runPreReview } from './pre-review.js';

describe('End-to-end retrieval workflow', () => {
  let server: FastifyInstance;
  let store: JsonStore;
  let userId: string;
  let reviewerId: string;
  let teamId: string;
  let submitterSessionToken: string;
  let reviewerSessionToken: string;

  beforeAll(async () => {
    // Create temporary store
    const testDataFile = `/tmp/skill-shareer-workflow-test-${Date.now()}.json`;
    store = new JsonStore(testDataFile);

    // Build server with temporary store
    server = buildServer();
    server.skillShareer.store = store;

    await server.listen({ port: 0, host: '127.0.0.1' });
  });

  beforeEach(async () => {
    // Reset store data
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

    // Setup test users and team
    const createdAt = nowIso();

    await store.transact(async (data) => {
      // Create submitter user
      userId = store.nextId(data, 'user');
      data.users.push({
        id: userId,
        handle: 'submitter',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      // Create reviewer user
      reviewerId = store.nextId(data, 'user');
      data.users.push({
        id: reviewerId,
        handle: 'reviewer',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });

      // Create team
      teamId = store.nextId(data, 'team');
      data.teams.push({
        id: teamId,
        name: 'Test Team',
        slug: 'test-team',
        description: 'Test team for workflow',
        createdAt,
        updatedAt: createdAt,
      });

      // Create submitter membership with knowledge:submit permission
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

      // Create reviewer membership with knowledge:review permission
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

      // Create submitter session
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

      // Create reviewer session
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
    // Clean up knowledge entries between tests
    await store.transact(async (data) => {
      data.knowledgeEntries = [];
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('full submission to search workflow', () => {
    it('should not return unapproved knowledge in search results', async () => {
      // Submit knowledge entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Verify the entry is not approved (submitted or agent-rejected)
      const snapshot = await store.snapshot();
      const entry = snapshot.knowledgeEntries.find((e) => e.id === entryId);
      expect(entry).toBeDefined();
      expect(['submitted', 'agent-rejected', 'rejected']).toContain(entry?.lifecycleState ?? '');

      // Try to search - should NOT return the unapproved entry
      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // The unapproved entry should NOT appear in search results
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const unapprovedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(unapprovedMatch).toBeUndefined();
    });

    it('should return approved knowledge in search results after reviewer approval', async () => {
      // Submit knowledge entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Reviewer approves the entry
      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Looks good',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      // Now search should return the approved entry
      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // The approved entry SHOULD appear in search results
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const approvedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(approvedMatch).toBeDefined();
      expect(approvedMatch.shortcut).toBe('Use strict types');
    });
  });

  describe('resubmit workflow with rejection', () => {
    it('should allow resubmit after rejection and preserve lifecycle linkage', async () => {
      // Submit knowledge entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Reviewer rejects the entry
      const rejectResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'reject',
          notes: 'Please provide more detail about the bug',
        }),
      });

      expect(rejectResponse.statusCode).toBe(200);

      // Verify rejection details are visible through entry endpoint
      const statusResponse = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusData = statusResponse.json();

      // Should show rejected state
      expect(statusData.entry.lifecycleState).toBe('rejected');

      // Resubmit with corrected content
      const resubmitResponse = await server.inject({
        method: 'POST',
        url: `/v1/knowledge/${entryId}/resubmit`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Should show resubmission was successful
      expect(resubmitData.entry.id).toBe(entryId);
      expect(resubmitData.entry.latestRevision.revision).toBe(2);

      // Verify resubmission preserved linkage to original attempt
      const snapshot = await store.snapshot();
      const entry = snapshot.knowledgeEntries.find((e) => e.id === entryId);
      expect(entry).toBeDefined();

      // Should have resubmissionOf link in submission history
      const latestSubmission = entry?.submissionHistory[entry.submissionHistory.length - 1];
      expect(latestSubmission?.resubmissionOf).toBeTruthy();

      // Reviewer approves the corrected entry
      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approved with additional detail',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      // Now search should return the approved corrected entry
      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // The approved corrected entry SHOULD appear in search results
      const allMatches = [...searchData.globalConstraints, ...searchData.projectKnowledge];
      const approvedMatch = allMatches.find((m: any) => m.entryId === entryId);
      expect(approvedMatch).toBeDefined();
      expect(approvedMatch.shortcut).toBe('Fix the memory leak in worker');
    });
  });

  describe('review-status history inspection', () => {
    it('should expose lifecycle history and reviewer feedback across rejection and approval', async () => {
      // Submit knowledge entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Reviewer rejects
      const rejectResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'reject',
          notes: 'Add more specific implementation details',
        }),
      });

      expect(rejectResponse.statusCode).toBe(200);

      // Check review-status shows rejection
      const statusResponse1 = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse1.statusCode).toBe(200);
      const statusData1 = statusResponse1.json();
      expect(statusData1.entry.lifecycleState).toBe('rejected');

      // Should show reviewer notes
      const lastDecision = statusData1.entry.reviewHistory[statusData1.entry.reviewHistory.length - 1];
      expect(lastDecision.notes).toBe('Add more specific implementation details');

      // Resubmit
      const resubmitResponse = await server.inject({
        method: 'POST',
        url: `/v1/knowledge/${entryId}/resubmit`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          labels: ['api'],
          shortcut: 'API rate limiting with Redis',
          detail: 'Use Redis-based token bucket algorithm for rate limiting',
        }),
      });

      expect(resubmitResponse.statusCode).toBe(200);

      // Reviewer approves
      const approveResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Good detail on implementation',
        }),
      });

      expect(approveResponse.statusCode).toBe(200);

      // Check review-status shows approval and retained history
      const statusResponse2 = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse2.statusCode).toBe(200);
      const statusData2 = statusResponse2.json();

      // Should show approved state
      expect(statusData2.entry.lifecycleState).toBe('approved');

      // Should show multiple revisions (history preserved)
      expect(statusData2.entry.history.length).toBeGreaterThan(1);

      // Should show review history with both decisions
      expect(statusData2.entry.reviewHistory.length).toBe(2);
    });
  });

  describe('JSON mode and stdin consistency', () => {
    it('should return parseable JSON from knowledge submission endpoint', async () => {
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Should have entry property with contract-shaped data
      expect(submitData).toHaveProperty('entry');
      expect(submitData.entry).toHaveProperty('id');
      expect(submitData.entry).toHaveProperty('lifecycleState');
      expect(submitData.entry).toHaveProperty('shortcut');
    });

    it('should return parseable JSON from retrieval search endpoint', async () => {
      // First, submit and approve an entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Approve the entry
      await server.inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: {
          'authorization': `Bearer ${reviewerSessionToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          entryId,
          decision: 'approve',
          notes: 'Approve for search test',
        }),
      });

      // Search with JSON output
      const searchResponse = await server.inject({
        method: 'POST',
        url: '/v1/retrieval/search',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Should have contract-shaped retrieval data
      expect(searchData).toHaveProperty('globalConstraints');
      expect(searchData).toHaveProperty('projectKnowledge');
      expect(searchData).toHaveProperty('refinementSummary');
      expect(Array.isArray(searchData.globalConstraints)).toBe(true);
      expect(Array.isArray(searchData.projectKnowledge)).toBe(true);
    });

    it('should return parseable JSON from review-status endpoint', async () => {
      // Submit an entry
      const submitResponse = await server.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
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

      // Get entry details
      const statusResponse = await server.inject({
        method: 'GET',
        url: `/v1/knowledge/${entryId}`,
        headers: {
          'authorization': `Bearer ${submitterSessionToken}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusData = statusResponse.json();

      // Should have contract-shaped entry data
      expect(statusData).toHaveProperty('entry');
      expect(statusData.entry).toHaveProperty('id');
      expect(statusData.entry).toHaveProperty('lifecycleState');
      expect(statusData.entry).toHaveProperty('history');
      expect(statusData.entry).toHaveProperty('reviewHistory');
    });
  });
});
