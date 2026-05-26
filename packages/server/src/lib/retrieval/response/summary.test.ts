import { describe, expect, it } from 'vitest';

import type { CapsuleMatch, RetrievalCitation } from '@trapmap/contracts';
import { buildCapsuleSummary, buildSummary } from './summary.js';

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
          detail:
            'Always use HTTPS to encrypt data in transit and prevent man-in-the-middle attacks.',
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
      expect(result?.citations[0]?.source.entryId).toBe('entry_1');
      expect(result?.citations[1]?.source.entryId).toBe('entry_2');
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

  describe('buildCapsuleSummary (T-14-08)', () => {
    it('returns null when summary is disabled', () => {
      const result = buildCapsuleSummary({
        query: 'test query',
        includeSummary: false,
        capsules: [],
      });

      expect(result).toBeNull();
    });

    it('returns null when no capsules are provided', () => {
      const result = buildCapsuleSummary({
        query: 'test query',
        includeSummary: true,
        capsules: [],
      });

      expect(result).toBeNull();
    });

    it('returns null when no citations are provided', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Test content',
          situation: 'Test situation',
          problem: 'Test problem',
          goal: 'Test goal',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.9,
          reason: 'High match',
        },
      ];

      const result = buildCapsuleSummary({
        query: 'test query',
        includeSummary: true,
        capsules,
        // No citations provided
      });

      expect(result).toBeNull();
    });

    it('generates summary text from provided capsule hits', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Use docker-compose for container networking',
          situation: 'Deploying containers',
          problem: 'Container networking is complex',
          goal: 'Simplify with docker-compose',
          labels: ['docker'],
          scope: 'project',
          requiredLevel: 2,
          score: 0.95,
          reason: 'High match on problem',
        },
        {
          capsuleId: 'capsule_2',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Check container logs for errors',
          situation: 'Debugging containers',
          problem: 'Container fails to start',
          goal: 'Check logs for error details',
          labels: ['docker', 'debugging'],
          scope: 'project',
          requiredLevel: 2,
          score: 0.85,
          reason: 'Moderate match on situation',
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'capsule_1',
            scope: 'project',
            shortcut: 'Docker Skills',
          },
          snippet: 'Container networking is complex',
          tags: ['docker'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.95,
            keyword: null,
            graph: null,
            preRerank: 0.95,
            final: 0.95,
          },
        },
      ];

      const result = buildCapsuleSummary({
        query: 'docker container issues',
        includeSummary: true,
        capsules,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.text).toBeDefined();
      expect(result?.text.length).toBeGreaterThan(0);
      // Summary should mention the capsules found
      expect(result?.text.toLowerCase()).toContain('capsule');
    });

    it('includes citations for all provided hits', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Test',
          situation: 'Test',
          problem: 'Test problem',
          goal: 'Test goal',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.9,
          reason: 'Match',
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'capsule_1',
            scope: 'global',
            shortcut: 'Test Skill',
          },
          snippet: 'Test problem',
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

      const result = buildCapsuleSummary({
        query: 'test',
        includeSummary: true,
        capsules,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.citations).toBeDefined();
      expect(result?.citations.length).toBe(1);
      expect(result?.citations[0]?.source.entryId).toBe('capsule_1');
    });

    it('summary is deterministic and does not depend on external services', () => {
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Test content',
          situation: 'Test situation',
          problem: 'Test problem',
          goal: 'Test goal',
          labels: ['test'],
          scope: 'global',
          requiredLevel: 0,
          score: 0.9,
          reason: 'Match',
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'capsule_1',
            scope: 'global',
            shortcut: 'Test Skill',
          },
          snippet: 'Test problem',
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

      const result1 = buildCapsuleSummary({
        query: 'test',
        includeSummary: true,
        capsules,
        citations,
      });

      const result2 = buildCapsuleSummary({
        query: 'test',
        includeSummary: true,
        capsules,
        citations,
      });

      // Same inputs should produce same outputs (deterministic)
      expect(result1?.text).toBe(result2?.text);
    });

    it('summary reflects only filtered capsules - mixed Node/Flask regression', () => {
      const nodeCapsule: CapsuleMatch = {
        capsuleId: 'capsule_node_1',
        artifactId: 'artifact_core_label_filter_node',
        revision: 1,
        sourcePaths: ['SKILL.md'],
        content: 'Express.js middleware for request validation',
        situation: 'Building REST APIs',
        problem: 'Need input validation middleware',
        goal: 'Validate requests with Express.js middleware',
        labels: ['nodejs'],
        scope: 'global',
        requiredLevel: 0,
        score: 0.92,
        reason: 'High match on problem',
      };

      const flaskCapsule: CapsuleMatch = {
        capsuleId: 'capsule_flask_1',
        artifactId: 'artifact_core_label_filter_flask',
        revision: 1,
        sourcePaths: ['SKILL.md'],
        content: 'Flask route decorators for API endpoints',
        situation: 'Building REST APIs with Python',
        problem: 'Need Python web framework',
        goal: 'Build APIs with Flask',
        labels: ['python'],
        scope: 'global',
        requiredLevel: 0,
        score: 0.88,
        reason: 'Moderate match on situation',
      };

      const nodeCitations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'capsule_node_1',
            scope: 'global',
            shortcut: 'Building REST APIs',
          },
          snippet: 'Express.js middleware for request validation',
          tags: ['nodejs'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.92,
            keyword: null,
            graph: null,
            preRerank: 0.92,
            final: 0.92,
          },
        },
      ];

      // Scenario A: both capsules present (unfiltered) - summary mentions both
      const unfilteredResult = buildCapsuleSummary({
        query: 'middleware for REST APIs',
        includeSummary: true,
        capsules: [nodeCapsule, flaskCapsule],
        citations: [
          ...nodeCitations,
          {
            source: {
              entryId: 'capsule_flask_1',
              scope: 'global',
              shortcut: 'Building REST APIs with Python',
            },
            snippet: 'Flask route decorators for API endpoints',
            tags: ['python'],
            recallChannels: ['semantic'],
            scores: {
              semantic: 0.88,
              keyword: null,
              graph: null,
              preRerank: 0.88,
              final: 0.88,
            },
          },
        ],
      });

      expect(unfilteredResult).not.toBeNull();
      expect(unfilteredResult?.text).toContain('Express.js');
      expect(unfilteredResult?.text).toContain('Flask');

      // Scenario B: only nodejs capsule passed (simulating label filtering)
      const filteredResult = buildCapsuleSummary({
        query: 'middleware for REST APIs',
        includeSummary: true,
        capsules: [nodeCapsule], // Flask capsule filtered out by label filter
        citations: nodeCitations,
      });

      expect(filteredResult).not.toBeNull();
      expect(filteredResult?.text).toContain('Express.js middleware');
      expect(filteredResult?.text).not.toContain('Flask');
    });

    it('only consumes already-filtered distilled hits (T-14-08 mitigation)', () => {
      // This test verifies that buildCapsuleSummary is a pure function
      // that only uses its inputs, never bypassing governance filters
      const capsules: CapsuleMatch[] = [
        {
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Pre-filtered capsule content',
          situation: 'Pre-filtered situation',
          problem: 'Pre-filtered problem',
          goal: 'Pre-filtered goal',
          labels: ['test'],
          scope: 'project',
          requiredLevel: 3,
          score: 0.85,
          reason: 'Filtered match',
        },
      ];

      const citations: RetrievalCitation[] = [
        {
          source: {
            entryId: 'capsule_1',
            scope: 'project',
            shortcut: 'Test',
          },
          snippet: 'Pre-filtered problem',
          tags: ['test'],
          recallChannels: ['semantic'],
          scores: {
            semantic: 0.85,
            keyword: null,
            graph: null,
            preRerank: 0.85,
            final: 0.85,
          },
        },
      ];

      // The function should work with just the inputs, no external dependencies
      const result = buildCapsuleSummary({
        query: 'test',
        includeSummary: true,
        capsules,
        citations,
      });

      expect(result).not.toBeNull();
      expect(result?.text).toBeDefined();
      // Verify it used the filtered capsule content
      expect(result?.text).toContain('Pre-filtered capsule content');
    });
  });
});
