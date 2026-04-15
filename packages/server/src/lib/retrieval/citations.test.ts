import { describe, expect, it } from 'vitest';

import type { MergedCandidate } from './types.js';
import { buildCitation } from './citations.js';

// Helper to create a minimal KnowledgeRecord for tests
function createMockEntry(overrides: Partial<{
  id: string;
  scope: 'global' | 'project';
  shortcut: string;
  detail: string;
  labels: string[];
  requiredLevel: number;
}>): MergedCandidate['entry'] {
  return {
    id: overrides.id ?? 'entry_1',
    teamId: null,
    scope: overrides.scope ?? 'global',
    shortcut: overrides.shortcut ?? 'Test shortcut',
    detail: overrides.detail ?? 'Test detail with more context',
    labels: overrides.labels ?? ['test', 'example'],
    requiredLevel: overrides.requiredLevel ?? 3,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedByUserId: 'user_1',
      submittedAt: '2024-01-01T00:00:00Z',
      shortcut: overrides.shortcut ?? 'Test shortcut',
      detail: overrides.detail ?? 'Test detail with more context',
      labels: overrides.labels ?? ['test', 'example'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: overrides.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 0,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: '2024-01-01T00:00:00Z',
      latestDecision: 'approve',
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('citations', () => {
  describe('buildCitation', () => {
    it('builds citation from semantic-only candidate', () => {
      const candidate: MergedCandidate = {
        entry: createMockEntry({
          id: 'entry_1',
          shortcut: 'Test shortcut',
          detail: 'Test detail with more context',
          labels: ['test', 'example'],
          requiredLevel: 3,
        }),
        semanticScore: 0.8,
        keywordScore: 0,
        combinedScore: 0.8,
        preRerankScore: 0.8,
        finalScore: 0.8,
        tokenMatches: [],
        channels: ['semantic'],
      };

      const citation = buildCitation(candidate);

      expect(citation).toBeDefined();
      expect(citation.source.entryId).toBe('entry_1');
      expect(citation.source.scope).toBe('global');
      expect(citation.source.shortcut).toBe('Test shortcut');
      expect(citation.snippet).toBe('Test detail with more context');
      expect(citation.tags).toEqual(['test', 'example']);
      expect(citation.recallChannels).toEqual(['semantic']);
      expect(citation.scores.semantic).toBe(0.8);
      expect(citation.scores.keyword).toBeNull();
      expect(citation.scores.graph).toBeNull();
      expect(citation.scores.preRerank).toBe(0.8);
      expect(citation.scores.final).toBe(0.8);
    });

    it('builds citation from hybrid candidate', () => {
      const candidate: MergedCandidate = {
        entry: createMockEntry({
          id: 'entry_2',
          scope: 'project',
          shortcut: 'Hybrid test',
          detail: 'Detail with keyword matches',
          labels: ['hybrid', 'test'],
          requiredLevel: 5,
        }),
        semanticScore: 0.6,
        keywordScore: 0.4,
        combinedScore: 0.52,
        preRerankScore: 0.52,
        finalScore: 0.67,
        tokenMatches: [
          { token: 'keyword', fields: ['shortcut'] },
          { token: 'matches', fields: ['detail'] },
        ],
        channels: ['semantic', 'keyword'],
      };

      const citation = buildCitation(candidate);

      expect(citation).toBeDefined();
      expect(citation.source.entryId).toBe('entry_2');
      expect(citation.source.scope).toBe('project');
      expect(citation.recallChannels).toEqual(['semantic', 'keyword']);
      expect(citation.scores.semantic).toBe(0.6);
      expect(citation.scores.keyword).toBe(0.4);
      expect(citation.scores.graph).toBeNull();
      expect(citation.scores.preRerank).toBe(0.52);
      expect(citation.scores.final).toBe(0.67);
    });

    it('builds citation from graph-assisted candidate', () => {
      const candidate: MergedCandidate = {
        entry: createMockEntry({
          id: 'entry_3',
          scope: 'global',
          shortcut: 'Graph test',
          detail: 'Graph expanded result',
          labels: ['graph', 'entity'],
          requiredLevel: 3,
        }),
        semanticScore: 0.5,
        keywordScore: 0.3,
        graphScore: 0.2,
        combinedScore: 0.54,
        preRerankScore: 0.54,
        finalScore: 0.54,
        tokenMatches: [],
        channels: ['semantic', 'keyword', 'graph'],
      };

      const citation = buildCitation(candidate);

      expect(citation).toBeDefined();
      expect(citation.source.entryId).toBe('entry_3');
      expect(citation.recallChannels).toEqual(['semantic', 'keyword', 'graph']);
      expect(citation.scores.semantic).toBe(0.5);
      expect(citation.scores.keyword).toBe(0.3);
      expect(citation.scores.graph).toBe(0.2);
      expect(citation.scores.preRerank).toBe(0.54);
      expect(citation.scores.final).toBe(0.54);
    });

    it('truncates snippet to reasonable length', () => {
      const candidate: MergedCandidate = {
        entry: createMockEntry({
          id: 'entry_4',
          scope: 'global',
          shortcut: 'Long snippet test',
          detail: 'A'.repeat(500), // Very long detail
          labels: ['test'],
          requiredLevel: 3,
        }),
        semanticScore: 0.7,
        keywordScore: 0,
        combinedScore: 0.7,
        preRerankScore: 0.7,
        finalScore: 0.7,
        tokenMatches: [],
        channels: ['semantic'],
      };

      const citation = buildCitation(candidate);

      // Snippet should be truncated to ~200 characters
      expect(citation.snippet.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(citation.snippet).toMatch(/\.\.\.$/);
    });

    it('handles empty token matches', () => {
      const candidate: MergedCandidate = {
        entry: createMockEntry({
          id: 'entry_5',
          scope: 'project',
          shortcut: 'No tokens',
          detail: 'Semantic only result',
          labels: [],
          requiredLevel: 5,
        }),
        semanticScore: 0.9,
        keywordScore: 0,
        combinedScore: 0.9,
        preRerankScore: 0.9,
        finalScore: 0.9,
        tokenMatches: [],
        channels: ['semantic'],
      };

      const citation = buildCitation(candidate);

      expect(citation).toBeDefined();
      expect(citation.source.entryId).toBe('entry_5');
      expect(citation.tags).toEqual([]);
    });
  });
});
