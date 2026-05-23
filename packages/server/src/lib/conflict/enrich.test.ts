import { describe, expect, it } from 'vitest';

import type { ConflictRelation } from '@trapmap/contracts';
import type { KnowledgeRecord, StoreData } from '@trapmap/server/lib/store.js';
import {
  buildConflictLookup,
  conflictToHint,
  enrichMatchesWithConflicts,
  getConflictHints,
} from './enrich.js';

describe('conflict enrichment', () => {
  describe('buildConflictLookup', () => {
    it('returns empty Map for empty conflicts array', () => {
      const result = buildConflictLookup([]);
      expect(result.size).toBe(0);
    });

    it('adds entry to lookup for both entryIdA and entryIdB', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Test conflict',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
      ];

      const result = buildConflictLookup(conflicts);

      expect(result.size).toBe(2);
      expect(result.get('entry-1')).toHaveLength(1);
      expect(result.get('entry-2')).toHaveLength(1);
    });

    it('groups multiple conflicts for same entry correctly', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Conflict 1',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
        {
          id: 'conflict-2',
          entryIdA: 'entry-1',
          entryIdB: 'entry-3',
          conflictType: 'contradictory',
          context: 'Conflict 2',
          problemOverlapScore: 0.9,
          solutionDiffScore: 0.85,
          detectedAt: '2026-05-02T11:00:00Z',
        },
      ];

      const result = buildConflictLookup(conflicts);

      expect(result.get('entry-1')).toHaveLength(2);
      expect(result.get('entry-2')).toHaveLength(1);
      expect(result.get('entry-3')).toHaveLength(1);
    });
  });

  describe('conflictToHint', () => {
    const entries: KnowledgeRecord[] = [
      {
        id: 'entry-1',
        shortcut: 'Use REST',
        detail: 'REST API design',
        labels: [],
        lifecycleState: 'approved',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        ownerUserId: 'user-1',
        latestRevision: {
          revision: 1,
          submittedAt: '2026-05-02T10:00:00Z',
          submittedByUserId: 'user-1',
          shortcut: 'Use REST',
          detail: 'REST API design',
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
      } as KnowledgeRecord,
      {
        id: 'entry-2',
        shortcut: 'Use GraphQL',
        detail: 'GraphQL API design',
        labels: [],
        lifecycleState: 'approved',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        ownerUserId: 'user-1',
        latestRevision: {
          revision: 1,
          submittedAt: '2026-05-02T10:00:00Z',
          submittedByUserId: 'user-1',
          shortcut: 'Use GraphQL',
          detail: 'GraphQL API design',
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
      } as KnowledgeRecord,
    ];

    it('returns ConflictHint with correct fields', () => {
      const conflict: ConflictRelation = {
        id: 'conflict-1',
        entryIdA: 'entry-1',
        entryIdB: 'entry-2',
        conflictType: 'alternative',
        context: 'Different approaches',
        problemOverlapScore: 0.8,
        solutionDiffScore: 0.5,
        detectedAt: '2026-05-02T10:00:00Z',
      };

      const result = conflictToHint(conflict, 'entry-1', entries);

      expect(result).not.toBeNull();
      expect(result!.entryId).toBe('entry-2');
      expect(result!.shortcut).toBe('Use GraphQL');
      expect(result!.conflictType).toBe('alternative');
      expect(result!.context).toBe('Different approaches');
    });

    it('returns null if other entry not found', () => {
      const conflict: ConflictRelation = {
        id: 'conflict-1',
        entryIdA: 'entry-1',
        entryIdB: 'nonexistent',
        conflictType: 'alternative',
        context: 'Test',
        problemOverlapScore: 0.8,
        solutionDiffScore: 0.5,
        detectedAt: '2026-05-02T10:00:00Z',
      };

      const result = conflictToHint(conflict, 'entry-1', entries);

      expect(result).toBeNull();
    });
  });

  describe('getConflictHints', () => {
    const createTestEntry = (
      id: string,
      shortcut: string,
      teamId: string | null = null,
      requiredLevel = 0,
    ): KnowledgeRecord =>
      ({
        id,
        shortcut,
        detail: `Detail for ${shortcut}`,
        labels: [],
        lifecycleState: 'approved',
        teamId,
        scope: 'global',
        requiredLevel,
        ownerUserId: 'user-1',

        latestRevision: {
          revision: 1,
          submittedAt: '2026-05-02T10:00:00Z',
          submittedByUserId: 'user-1',
          shortcut,
          detail: `Detail for ${shortcut}`,
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

    it('returns empty array for entry with no conflicts', () => {
      const lookup = buildConflictLookup([]);
      const entries = [createTestEntry('entry-1', 'Test')];

      const result = getConflictHints('entry-1', lookup, entries);

      expect(result).toEqual([]);
    });

    it('returns hints for entry with conflicts', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Test conflict',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
      ];
      const lookup = buildConflictLookup(conflicts);
      const entries = [
        createTestEntry('entry-1', 'Option A'),
        createTestEntry('entry-2', 'Option B'),
      ];

      const result = getConflictHints('entry-1', lookup, entries);

      expect(result).toHaveLength(1);
      expect(result[0]!.entryId).toBe('entry-2');
    });

    it('respects team governance filter (skips different team)', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Test conflict',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
      ];
      const lookup = buildConflictLookup(conflicts);
      const entries = [
        createTestEntry('entry-1', 'Option A'),
        createTestEntry('entry-2', 'Option B', 'team-other'), // Different team
      ];

      const result = getConflictHints('entry-1', lookup, entries, {
        teamId: 'team-user',
        requiredLevel: 0,
      });

      expect(result).toHaveLength(0); // Filtered out due to team mismatch
    });

    it('respects level governance filter (skips higher requiredLevel)', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Test conflict',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
      ];
      const lookup = buildConflictLookup(conflicts);
      const entries = [
        createTestEntry('entry-1', 'Option A'),
        createTestEntry('entry-2', 'Option B', null, 10), // Higher level required
      ];

      const result = getConflictHints('entry-1', lookup, entries, {
        teamId: null,
        requiredLevel: 5, // User has level 5, entry requires 10
      });

      expect(result).toHaveLength(0); // Filtered out due to level
    });
  });

  describe('enrichMatchesWithConflicts', () => {
    const createTestEntry = (id: string, shortcut: string): KnowledgeRecord =>
      ({
        id,
        shortcut,
        detail: `Detail for ${shortcut}`,
        labels: [],
        lifecycleState: 'approved',
        teamId: null,
        scope: 'global',
        requiredLevel: 0,
        ownerUserId: 'user-1',

        latestRevision: {
          revision: 1,
          submittedAt: '2026-05-02T10:00:00Z',
          submittedByUserId: 'user-1',
          shortcut,
          detail: `Detail for ${shortcut}`,
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

    it('returns Map with hints for matches that have conflicts', () => {
      const conflicts: ConflictRelation[] = [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'alternative',
          context: 'Test conflict',
          problemOverlapScore: 0.8,
          solutionDiffScore: 0.5,
          detectedAt: '2026-05-02T10:00:00Z',
        },
      ];
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [
          createTestEntry('entry-1', 'Option A'),
          createTestEntry('entry-2', 'Option B'),
        ],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts,
      };

      const matches = [{ entryId: 'entry-1' }, { entryId: 'entry-2' }];
      const result = enrichMatchesWithConflicts(matches, data);

      expect(result.size).toBe(2);
      expect(result.get('entry-1')).toHaveLength(1);
      expect(result.get('entry-2')).toHaveLength(1);
    });

    it('handles empty matches array', () => {
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

      const result = enrichMatchesWithConflicts([], data);

      expect(result.size).toBe(0);
    });

    it('only includes entries with conflicts in result', () => {
      const data: StoreData = {
        counters: {},
        users: [],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [
          createTestEntry('entry-1', 'Option A'),
          createTestEntry('entry-2', 'Option B'),
          createTestEntry('entry-3', 'Option C'),
        ],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
        entityLineage: [],
        graphIndexDocuments: [],
        conflicts: [], // No conflicts
      };

      const matches = [{ entryId: 'entry-1' }, { entryId: 'entry-2' }, { entryId: 'entry-3' }];
      const result = enrichMatchesWithConflicts(matches, data);

      expect(result.size).toBe(0); // No conflicts, so empty map
    });
  });
});
