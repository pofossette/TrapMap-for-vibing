import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord, SkillShareerStore, StoreData } from '../store.js';
import {
  classifyConflict,
  detectConflicts,
  generateConflictContext,
  overlapScore,
  tokenize,
} from './detect.js';

describe('conflict detection', () => {
  describe('tokenize', () => {
    it('tokenizes text into lowercase tokens', () => {
      const result = tokenize('Hello World 123');
      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.has('123')).toBe(true);
    });

    it('filters tokens shorter than 3 characters', () => {
      const result = tokenize('a bb ccc dddd');
      expect(result.has('a')).toBe(false);
      expect(result.has('bb')).toBe(false);
      expect(result.has('ccc')).toBe(true);
      expect(result.has('dddd')).toBe(true);
    });

    it('converts to lowercase', () => {
      const result = tokenize('HELLO World');
      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
    });

    it('splits on non-alphanumeric characters', () => {
      const result = tokenize('hello-world_test.code');
      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.has('test')).toBe(true);
      expect(result.has('code')).toBe(true);
    });
  });

  describe('overlapScore', () => {
    it('returns 1 for identical sets', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['a', 'b', 'c']);
      expect(overlapScore(setA, setB)).toBe(1);
    });

    it('returns 0 for disjoint sets', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['x', 'y', 'z']);
      expect(overlapScore(setA, setB)).toBe(0);
    });

    it('calculates partial overlap correctly', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['b', 'c', 'd']);
      // shared: b, c = 2
      // union: a, b, c, d = 4
      // score = 2/4 = 0.5
      expect(overlapScore(setA, setB)).toBe(0.5);
    });

    it('returns 0 for empty sets', () => {
      expect(overlapScore(new Set(), new Set(['a']))).toBe(0);
      expect(overlapScore(new Set(['a']), new Set())).toBe(0);
      expect(overlapScore(new Set(), new Set())).toBe(0);
    });
  });

  describe('classifyConflict', () => {
    it('returns null when problemOverlap < 0.5', () => {
      expect(classifyConflict(0.4, 0.5)).toBeNull();
    });

    it('returns null when solutionDiff < 0.3', () => {
      expect(classifyConflict(0.6, 0.2)).toBeNull();
    });

    it('returns "contradictory" when solutionDiff >= 0.8', () => {
      expect(classifyConflict(0.6, 0.8)).toBe('contradictory');
      expect(classifyConflict(0.5, 0.9)).toBe('contradictory');
    });

    it('returns "alternative" when solutionDiff >= 0.4 and < 0.8', () => {
      expect(classifyConflict(0.6, 0.4)).toBe('alternative');
      expect(classifyConflict(0.5, 0.7)).toBe('alternative');
    });

    it('returns "superseded" when solutionDiff < 0.4', () => {
      expect(classifyConflict(0.6, 0.3)).toBe('superseded');
    });
  });

  describe('generateConflictContext', () => {
    it('generates context for alternative conflict', () => {
      const result = generateConflictContext(
        { shortcut: 'Use REST' },
        { shortcut: 'Use GraphQL' },
        'alternative',
      );
      expect(result).toBe('Different approaches to the same problem: "Use REST" vs "Use GraphQL"');
    });

    it('generates context for contradictory conflict', () => {
      const result = generateConflictContext(
        { shortcut: 'Enable cache' },
        { shortcut: 'Disable cache' },
        'contradictory',
      );
      expect(result).toBe(
        'Opposing solutions for the same problem: "Enable cache" vs "Disable cache"',
      );
    });

    it('generates context for superseded conflict', () => {
      const result = generateConflictContext(
        { shortcut: 'Old approach' },
        { shortcut: 'New approach' },
        'superseded',
      );
      expect(result).toBe('Newer approach supersedes older one: "Old approach" vs "New approach"');
    });
  });

  describe('detectConflicts', () => {
    const createMockStore = (data: StoreData): SkillShareerStore => ({
      snapshot: async () => data,
      transact: async <T>(mutator: (data: StoreData) => T | Promise<T>): Promise<T> => {
        return mutator(data);
      },
      nextId: (data: StoreData, prefix: string) => {
        const nextValue = (data.counters[prefix] ?? 0) + 1;
        data.counters[prefix] = nextValue;
        return `${prefix}_${nextValue}`;
      },
    });

    const createTestEntry = (
      id: string,
      shortcut: string,
      detail: string,
      lifecycleState: 'approved' | 'submitted' | 'rejected' = 'approved',
    ): KnowledgeRecord =>
      ({
        id,
        shortcut,
        detail,
        labels: [],
        lifecycleState,
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        ownerUserId: 'user-1',
        latestRevision: {
          revision: 1,
          submittedAt: '2026-05-02T10:00:00Z',
          submittedByUserId: 'user-1',
          shortcut,
          detail,
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
        indexState: null,
        createdAt: '2026-05-02T10:00:00Z',
        updatedAt: '2026-05-02T10:00:00Z',
      }) as KnowledgeRecord;

    it('returns empty array for non-approved entry', async () => {
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [createTestEntry('entry-1', 'Test', 'Test detail', 'submitted')],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [],
      };
      const store = createMockStore(data);

      const result = await detectConflicts({
        services: { store, data },
        entryId: 'entry-1',
      });

      expect(result).toEqual([]);
    });

    it('returns empty array for entry not found', async () => {
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [],
      };
      const store = createMockStore(data);

      const result = await detectConflicts({
        services: { store, data },
        entryId: 'nonexistent',
      });

      expect(result).toEqual([]);
    });

    it('detects conflict with high problem overlap and high solution diff', async () => {
      // Use identical shortcuts (100% problem overlap) but very different details
      const entry1 = createTestEntry(
        'entry-1',
        'API Design Pattern',
        'Use REST architecture with HTTP endpoints for API design',
      );
      const entry2 = createTestEntry(
        'entry-2',
        'API Design Pattern',
        'Use GraphQL schema with typed queries for API design',
      );
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [entry1, entry2],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [],
      };
      const store = createMockStore(data);

      const result = await detectConflicts({
        services: { store, data },
        entryId: 'entry-2',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.conflictType).toBe('alternative');
      expect(result[0]!.entryIdA).toBe('entry-1'); // Lower ID first
      expect(result[0]!.entryIdB).toBe('entry-2');
    });

    it('does not create duplicate conflicts for same pair', async () => {
      const entry1 = createTestEntry('entry-1', 'API Design', 'Use REST');
      const entry2 = createTestEntry('entry-2', 'API Design', 'Use GraphQL');
      const existingConflict = {
        id: 'conflict-1',
        entryIdA: 'entry-1',
        entryIdB: 'entry-2',
        conflictType: 'alternative' as const,
        context: 'Existing conflict',
        problemOverlapScore: 0.8,
        solutionDiffScore: 0.6,
        detectedAt: '2026-05-01T10:00:00Z',
      };
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [entry1, entry2],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [existingConflict],
      };
      const store = createMockStore(data);

      const result = await detectConflicts({
        services: { store, data },
        entryId: 'entry-2',
      });

      expect(result).toEqual([]);
    });

    it('stores conflicts with canonical ordering (lower ID first)', async () => {
      const entry1 = createTestEntry('entry-b', 'API Design', 'Use REST');
      const entry2 = createTestEntry('entry-a', 'API Design', 'Use GraphQL');
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [entry1, entry2],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [],
      };
      const store = createMockStore(data);

      const result = await detectConflicts({
        services: { store, data },
        entryId: 'entry-b',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.entryIdA).toBe('entry-a'); // Lower ID first (alphabetically)
      expect(result[0]!.entryIdB).toBe('entry-b');
    });
  });
});
