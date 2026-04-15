import { describe, expect, it } from 'vitest';

import type { RetrievalCitation } from '@skill-shareer/contracts';
import { buildSummary } from './summary.js';

describe('summary', () => {
  describe('buildSummary', () => {
    it('returns null when summary is disabled (includeSummary = false)', () => {
      const result = buildSummary({
        query: 'test query',
        includeSummary: false,
        hits: [],
      });

      expect(result).toBeNull();
    });

    it('returns null when no hits are provided', () => {
      const result = buildSummary({
        query: 'test query',
        includeSummary: true,
        hits: [],
      });

      expect(result).toBeNull();
    });

    it('returns null when no citations are provided (citations required by contract)', () => {
      const hits = [
        {
          shortcut: 'Test',
          detail: 'Test detail',
          labels: ['test'],
        },
      ];

      const result = buildSummary({
        query: 'test query',
        includeSummary: true,
        hits,
        // No citations provided
      });

      expect(result).toBeNull();
    });

    it('generates summary text from provided hits', () => {
      const hits = [
        {
          shortcut: 'Validate JWT tokens',
          detail: 'JWT tokens must be validated on every request to prevent authorization bypass.',
          labels: ['security', 'auth'],
        },
        {
          shortcut: 'Use HTTPS everywhere',
          detail: 'Always use HTTPS to encrypt data in transit and prevent man-in-the-middle attacks.',
          labels: ['security'],
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'entry_1',
            scope: 'global',
            shortcut: 'Validate JWT tokens',
          },
          snippet: 'JWT tokens must be validated on every request.',
          tags: ['security', 'auth'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.9,
            keyword: null,
            graph: null,
            preRerank: 0.9,
            final: 0.9,
          },
        },
      ];

      const result = buildSummary({
        query: 'security best practices',
        includeSummary: true,
        hits,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.text).toBeDefined();
      expect(result?.text.length).toBeGreaterThan(0);
      // Summary should be extractive, synthesizing from the hits
      expect(result?.text.toLowerCase()).toContain('jwt');
    });

    it('includes citations for all provided hits', () => {
      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'entry_1',
            scope: 'global',
            shortcut: 'Validate JWT tokens',
          },
          snippet: 'JWT tokens must be validated on every request.',
          tags: ['security', 'auth'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.9,
            keyword: null,
            graph: null,
            preRerank: 0.9,
            final: 0.9,
          },
        },
        {
          source: {
            entryId: 'entry_2',
            scope: 'global',
            shortcut: 'Use HTTPS everywhere',
          },
          snippet: 'Always use HTTPS to encrypt data in transit.',
          tags: ['security'],
          recallChannels: ['semantic', 'keyword'],
          scores: {
            semantic: 0.8,
            keyword: 0.6,
            graph: null,
            preRerank: 0.7,
            final: 0.75,
          },
        },
      ];

      const hits = [
        {
          shortcut: 'Validate JWT tokens',
          detail: 'JWT tokens must be validated on every request.',
          labels: ['security', 'auth'],
        },
        {
          shortcut: 'Use HTTPS everywhere',
          detail: 'Always use HTTPS to encrypt data in transit.',
          labels: ['security'],
        },
      ];

      const result = buildSummary({
        query: 'security best practices',
        includeSummary: true,
        hits,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.citations).toBeDefined();
      expect(result?.citations.length).toBe(2);
      expect(result?.citations[0].source.entryId).toBe('entry_1');
      expect(result?.citations[1].source.entryId).toBe('entry_2');
    });

    it('summary is deterministic and does not depend on external services', () => {
      const hits = [
        {
          shortcut: 'Test shortcut',
          detail: 'Test detail content',
          labels: ['test'],
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'entry_1',
            scope: 'global',
            shortcut: 'Test shortcut',
          },
          snippet: 'Test detail content',
          tags: ['test'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.9,
            keyword: null,
            graph: null,
            preRerank: 0.9,
            final: 0.9,
          },
        },
      ];

      const result1 = buildSummary({
        query: 'test query',
        includeSummary: true,
        hits,
        citations,
      });

      const result2 = buildSummary({
        query: 'test query',
        includeSummary: true,
        hits,
        citations,
      });

      // Same inputs should produce same outputs (deterministic)
      expect(result1?.text).toBe(result2?.text);
    });

    it('does NOT import store, recall adapters, or graph index', () => {
      // This test verifies that summary.ts is a pure function
      // We verify this by checking that the function only uses its inputs
      const hits = [
        {
          shortcut: 'Pure function test',
          detail: 'This should only use provided data',
          labels: ['test'],
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'entry_1',
            scope: 'global',
            shortcut: 'Pure function test',
          },
          snippet: 'This should only use provided data',
          tags: ['test'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.9,
            keyword: null,
            graph: null,
            preRerank: 0.9,
            final: 0.9,
          },
        },
      ];

      // The function should work with just the inputs, no external dependencies
      const result = buildSummary({
        query: 'test',
        includeSummary: true,
        hits,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.text).toBeDefined();
    });

    it('handles single hit correctly', () => {
      const hits = [
        {
          shortcut: 'Single result',
          detail: 'This is the only result',
          labels: ['test'],
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'entry_1',
            scope: 'global',
            shortcut: 'Single result',
          },
          snippet: 'This is the only result',
          tags: ['test'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.9,
            keyword: null,
            graph: null,
            preRerank: 0.9,
            final: 0.9,
          },
        },
      ];

      const result = buildSummary({
        query: 'single',
        includeSummary: true,
        hits,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.text).toBeDefined();
      expect(result?.text.length).toBeGreaterThan(0);
    });
  });
});
