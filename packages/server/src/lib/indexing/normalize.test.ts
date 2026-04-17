/**
 * Unit tests for deterministic normalization of knowledge entries for indexing.
 *
 * Tests cover:
 * - Equivalent input produces the same canonical text, token set, and content hash
 * - Normalization includes shortcut, detail, and labels
 * - Content hash is deterministic and stable
 * - Token sets are normalized (lowercase, deduplicated)
 */

import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../store.js';

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

// Import the functions we're testing
import { normalizeKnowledgeIndexDocument } from './normalize.js';

describe('normalizeKnowledgeIndexDocument', () => {
  it('produces the same canonical text for equivalent shortcut/detail/labels input', () => {
    const entry1 = createTestEntry({
      id: 'entry_1',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const entry2 = createTestEntry({
      id: 'entry_2',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const doc1 = normalizeKnowledgeIndexDocument(entry1);
    const doc2 = normalizeKnowledgeIndexDocument(entry2);

    // Canonical text should be identical for equivalent content
    expect(doc1.canonicalText).toBe(doc2.canonicalText);
  });

  it('produces the same token set for equivalent content', () => {
    const entry1 = createTestEntry({
      id: 'entry_1',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const entry2 = createTestEntry({
      id: 'entry_2',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const doc1 = normalizeKnowledgeIndexDocument(entry1);
    const doc2 = normalizeKnowledgeIndexDocument(entry2);

    // Token sets should be identical
    expect(doc1.tokens).toEqual(doc2.tokens);
    expect(new Set(doc1.tokens)).toEqual(new Set(doc2.tokens));
  });

  it('produces the same content hash for equivalent content', () => {
    const entry1 = createTestEntry({
      id: 'entry_1',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const entry2 = createTestEntry({
      id: 'entry_2',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const doc1 = normalizeKnowledgeIndexDocument(entry1);
    const doc2 = normalizeKnowledgeIndexDocument(entry2);

    // Content hash should be identical for equivalent content
    expect(doc1.contentHash).toBe(doc2.contentHash);
  });

  it('produces different content hash for different content', () => {
    const entry1 = createTestEntry({
      id: 'entry_1',
      shortcut: 'JWT Token Validation',
      detail: 'Use JWT tokens for API authentication',
      labels: ['security', 'auth'],
    });

    const entry2 = createTestEntry({
      id: 'entry_2',
      shortcut: 'Different Shortcut',
      detail: 'Completely different detail text',
      labels: ['other'],
    });

    const doc1 = normalizeKnowledgeIndexDocument(entry1);
    const doc2 = normalizeKnowledgeIndexDocument(entry2);

    // Content hash should be different for different content
    expect(doc1.contentHash).not.toBe(doc2.contentHash);
  });

  it('includes shortcut, detail, and labels in canonical text', () => {
    const entry = createTestEntry({
      shortcut: 'JWT Authentication',
      detail: 'Use tokens for API security',
      labels: ['security', 'api'],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    // Canonical text should contain all three fields
    expect(doc.canonicalText).toContain('JWT Authentication');
    expect(doc.canonicalText).toContain('Use tokens for API security');
    expect(doc.canonicalText).toContain('security');
    expect(doc.canonicalText).toContain('api');
  });

  it('produces deterministic results when called multiple times on the same entry', () => {
    const entry = createTestEntry({
      shortcut: 'Test Entry',
      detail: 'Test detail with some content',
      labels: ['test', 'example'],
    });

    const doc1 = normalizeKnowledgeIndexDocument(entry);
    const doc2 = normalizeKnowledgeIndexDocument(entry);
    const doc3 = normalizeKnowledgeIndexDocument(entry);

    // All deterministic fields should be identical (normalizedAt changes)
    expect(doc1.canonicalText).toBe(doc2.canonicalText);
    expect(doc2.canonicalText).toBe(doc3.canonicalText);
    expect(doc1.tokens).toEqual(doc2.tokens);
    expect(doc2.tokens).toEqual(doc3.tokens);
    expect(doc1.contentHash).toBe(doc2.contentHash);
    expect(doc2.contentHash).toBe(doc3.contentHash);

    // normalizedAt should be a valid ISO timestamp but may differ
    expect(doc1.normalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(doc2.normalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(doc3.normalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('normalizes tokens to lowercase', () => {
    const entry = createTestEntry({
      shortcut: 'JWT Authentication',
      detail: 'Use TOKENS for API SECURITY',
      labels: ['Security', 'AUTH'],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    // All tokens should be lowercase
    for (const token of doc.tokens) {
      expect(token).toBe(token.toLowerCase());
    }
  });

  it('removes duplicate tokens', () => {
    const entry = createTestEntry({
      shortcut: 'test test test',
      detail: 'test test test',
      labels: ['test', 'test', 'test'],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    // Should not have duplicate tokens
    const uniqueTokens = new Set(doc.tokens);
    expect(doc.tokens.length).toBe(uniqueTokens.size);
  });

  it('produces stable hash format (SHA-256 hex)', () => {
    const entry = createTestEntry({
      shortcut: 'Test Entry',
      detail: 'Test detail',
      labels: ['test'],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    // SHA-256 produces 64 hex characters
    expect(doc.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles empty labels array', () => {
    const entry = createTestEntry({
      shortcut: 'Test Entry',
      detail: 'Test detail',
      labels: [],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    expect(doc.tokens).toBeDefined();
    expect(Array.isArray(doc.tokens)).toBe(true);
    expect(doc.contentHash).toBeDefined();
    expect(doc.canonicalText).toBeDefined();
  });

  it('handles labels with special characters', () => {
    const entry = createTestEntry({
      shortcut: 'Test Entry',
      detail: 'Test detail',
      labels: ['api:v2', 'auth/oauth', 'test-name'],
    });

    const doc = normalizeKnowledgeIndexDocument(entry);

    // Should handle special characters in labels
    expect(doc.canonicalText).toContain('api:v2');
    expect(doc.canonicalText).toContain('auth/oauth');
    expect(doc.canonicalText).toContain('test-name');
  });
});
