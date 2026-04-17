/**
 * Unit tests for keyword recall adapter.
 *
 * Tests cover:
 * - Tokenization and normalization behavior
 * - Score bounds and determinism
 * - Entry exclusion when no token overlap
 * - Adapter operates only on passed-in entries (no internal filtering)
 */

import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../../store.js';
import { keywordRecall, normalizeQuery, tokenize } from './keyword.js';

/**
 * Helper to create a minimal KnowledgeRecord for testing.
 */
function createTestEntry(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'test_1',
    teamId: null,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: '',
      detail: '',
      labels: [],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as KnowledgeRecord;
}

describe('keyword recall', () => {
  describe('tokenize', () => {
    it('splits text into lowercase tokens on whitespace and punctuation', () => {
      const tokens = tokenize('JWT Token Validation!');
      expect(tokens).toEqual(['jwt', 'token', 'validation']);
    });

    it('removes duplicate tokens', () => {
      const tokens = tokenize('test test test');
      expect(tokens).toEqual(['test']);
    });

    it('handles empty string', () => {
      const tokens = tokenize('');
      expect(tokens).toEqual([]);
    });

    it('handles whitespace-only string', () => {
      const tokens = tokenize('   \t\n  ');
      expect(tokens).toEqual([]);
    });

    it('preserves alphanumeric characters', () => {
      const tokens = tokenize('API2_API3 test123');
      expect(tokens).toContain('api2');
      expect(tokens).toContain('api3');
      expect(tokens).toContain('test123');
    });

    it('splits on underscores and hyphens', () => {
      const tokens = tokenize('my_variable-name');
      expect(tokens).toEqual(['my', 'variable', 'name']);
    });
  });

  describe('normalizeQuery', () => {
    it('returns unique lowercase tokens from query text', () => {
      const tokens = normalizeQuery('JWT Token jwt TOKEN');
      expect(tokens).toEqual(['jwt', 'token']);
    });

    it('filters out very short tokens (less than 2 chars)', () => {
      const tokens = normalizeQuery('a an the JWT validation');
      // 'a' is filtered (1 char), 'an' and 'the' are kept (2+ chars)
      expect(tokens).toEqual(['an', 'the', 'jwt', 'validation']);
    });

    it('returns empty array for query with only short tokens', () => {
      const tokens = normalizeQuery('a b c d e');
      expect(tokens).toEqual([]);
    });
  });

  describe('keywordRecall', () => {
    it('tokenizes short queries and matches against shortcut, detail, and labels', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'JWT Authentication',
          detail: 'Use JWT tokens for API authentication',
          labels: ['security'],
        }),
        createTestEntry({
          id: 'entry_2',
          shortcut: 'Database Connection',
          detail: 'Configure PostgreSQL connection pool',
          labels: ['database'],
        }),
      ];

      const candidates = await keywordRecall('JWT tokens', entries);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]?.entry.id).toBe('entry_1');
    });

    it('normalizes scores to [0, 1] range', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'test keyword match',
          detail: 'test keyword match',
          labels: ['test', 'keyword', 'match'],
        }),
      ];

      const candidates = await keywordRecall('test keyword match', entries);

      expect(candidates.length).toBe(1);
      expect(candidates[0]?.score).toBeGreaterThanOrEqual(0);
      expect(candidates[0]?.score).toBeLessThanOrEqual(1);
    });

    it('scores are deterministic for the same fixture input', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'JWT Token Validation',
          detail: 'Validate JWT tokens on every request',
          labels: ['security', 'auth'],
        }),
      ];

      const candidates1 = await keywordRecall('JWT validation security', entries);
      const candidates2 = await keywordRecall('JWT validation security', entries);

      expect(candidates1).toEqual(candidates2);
    });

    it('excludes entries with no token overlap from candidate list', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'JWT Authentication',
          detail: 'Use JWT tokens for API authentication',
          labels: ['security'],
        }),
        createTestEntry({
          id: 'entry_2',
          shortcut: 'Database Connection',
          detail: 'Configure PostgreSQL connection pool',
          labels: ['database'],
        }),
        createTestEntry({
          id: 'entry_3',
          shortcut: 'Rate Limiting',
          detail: 'Implement rate limiting for API protection',
          labels: ['api'],
        }),
      ];

      const candidates = await keywordRecall('JWT authentication', entries);

      const candidateIds = candidates.map((c) => c.entry.id);
      expect(candidateIds).toContain('entry_1');
      expect(candidateIds).not.toContain('entry_2');
      expect(candidateIds).not.toContain('entry_3');
    });

    it('operates only on entries passed in by the caller', async () => {
      // The adapter should not filter by approval state, team, or level
      // It just scores lexical overlap
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'JWT Authentication',
          detail: 'Use JWT tokens for API authentication',
          labels: ['security'],
          lifecycleState: 'submitted', // Not approved - still processed
          requiredLevel: 10, // High level - still processed
        }),
      ];

      const candidates = await keywordRecall('JWT authentication', entries);

      // Should still return the entry because the adapter doesn't filter
      expect(candidates.length).toBe(1);
      expect(candidates[0]?.entry.id).toBe('entry_1');
    });

    it('returns candidates sorted by descending score', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_low',
          shortcut: 'Some topic',
          detail: 'Brief mention of keyword',
          labels: ['other'],
        }),
        createTestEntry({
          id: 'entry_high',
          shortcut: 'Keyword match title',
          detail: 'This entry is all about keyword match and keyword scoring',
          labels: ['keyword', 'match'],
        }),
      ];

      const candidates = await keywordRecall('keyword match', entries);

      expect(candidates.length).toBe(2);
      expect(candidates[0]?.score).toBeGreaterThanOrEqual(candidates[1]?.score ?? 0);
    });

    it('prefers exact label matches over body-text hits', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_labels',
          shortcut: 'General Tips', // No keyword match here
          detail: 'General tips for development', // No keyword match here
          labels: ['keyword', 'match'], // Exact label match - both tokens match labels only
        }),
        createTestEntry({
          id: 'entry_body',
          shortcut: 'General Title', // No keyword match here
          detail: 'This is all about keyword match in body text only', // Both tokens match detail only
          labels: ['other'], // No label match
        }),
      ];

      const candidates = await keywordRecall('keyword match', entries);

      // Both should appear
      expect(candidates.length).toBe(2);
      const labelEntry = candidates.find((c) => c.entry.id === 'entry_labels');
      const bodyEntry = candidates.find((c) => c.entry.id === 'entry_body');

      expect(labelEntry).toBeDefined();
      expect(bodyEntry).toBeDefined();

      // Label match (weight 3 each) should score higher than detail-only match (weight 1 each)
      // Each token: labelEntry gets 3, bodyEntry gets 1
      // Total: labelEntry=6, bodyEntry=2, normalized to same denominator
      expect(labelEntry?.score).toBeGreaterThan(bodyEntry?.score);
    });

    it('prefers shortcut matches over detail matches', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_shortcut',
          shortcut: 'Exact Keyword Match', // Shortcut match
          detail: 'Some unrelated content here',
          labels: [],
        }),
        createTestEntry({
          id: 'entry_detail',
          shortcut: 'General Title',
          detail: 'This has keyword match in the detail body text only',
          labels: [],
        }),
      ];

      const candidates = await keywordRecall('keyword match', entries);

      // Both should appear, but shortcut match should score higher
      expect(candidates.length).toBe(2);
      const shortcutEntry = candidates.find((c) => c.entry.id === 'entry_shortcut');
      const detailEntry = candidates.find((c) => c.entry.id === 'entry_detail');

      expect(shortcutEntry).toBeDefined();
      expect(detailEntry).toBeDefined();
      expect(shortcutEntry?.score).toBeGreaterThan(detailEntry?.score);
    });

    it('includes token match details for each candidate', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'JWT Authentication',
          detail: 'Use tokens for API security',
          labels: ['auth', 'security'],
        }),
      ];

      const candidates = await keywordRecall('JWT auth', entries);

      expect(candidates.length).toBe(1);
      const tokenMatches = candidates[0]?.tokenMatches ?? [];

      // Should have recorded where 'jwt' and 'auth' matched
      expect(tokenMatches.length).toBeGreaterThan(0);

      const jwtMatch = tokenMatches.find((m) => m.token === 'jwt');
      const authMatch = tokenMatches.find((m) => m.token === 'auth');

      expect(jwtMatch).toBeDefined();
      expect(jwtMatch?.fields).toContain('shortcut');

      expect(authMatch).toBeDefined();
      expect(authMatch?.fields).toContain('labels');
    });

    it('returns empty array when no entries match', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'Database Connection',
          detail: 'Configure PostgreSQL connection pool',
          labels: ['database'],
        }),
      ];

      const candidates = await keywordRecall('xyznonexistent', entries);

      expect(candidates).toEqual([]);
    });

    it('returns empty array for empty query', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'Some content',
          detail: 'Some detail',
          labels: ['test'],
        }),
      ];

      const candidates = await keywordRecall('', entries);

      expect(candidates).toEqual([]);
    });

    it('returns empty array for empty entry list', async () => {
      const candidates = await keywordRecall('test query', []);

      expect(candidates).toEqual([]);
    });

    it('sets channel to keyword for all candidates', async () => {
      const entries = [
        createTestEntry({
          id: 'entry_1',
          shortcut: 'Test content',
          detail: 'Test detail',
          labels: ['test'],
        }),
      ];

      const candidates = await keywordRecall('test', entries);

      expect(candidates.length).toBe(1);
      expect(candidates[0]?.channel).toBe('keyword');
    });
  });
});
