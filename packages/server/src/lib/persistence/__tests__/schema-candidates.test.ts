import { describe, expect, it } from 'vitest';

import {
  candidateAnalyses,
  candidateDuplicateCases,
  candidateDuplicateMatches,
  candidateManualResults,
  candidateResolutionOutcomes,
  candidates,
  entityLineage,
} from '@trapmap/server/lib/persistence/schema.js';

describe('candidates table schema', () => {
  it('exports a candidates pgTable with all required columns', () => {
    expect(candidates).toBeDefined();
    expect(typeof candidates).toBe('object');

    // Verify all 17 columns are defined (16 specified + id)
    const columnNames = Object.keys(candidates);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('sourceType');
    expect(columnNames).toContain('submittedByUserId');
    expect(columnNames).toContain('teamId');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('originalPayload');
    expect(columnNames).toContain('analysisSnapshot');
    expect(columnNames).toContain('duplicateCase');
    expect(columnNames).toContain('receivedAt');
    expect(columnNames).toContain('queuedAt');
    expect(columnNames).toContain('analyzingAt');
    expect(columnNames).toContain('completedAt');
    expect(columnNames).toContain('lastError');
    expect(columnNames).toContain('retryCount');
    expect(columnNames).toContain('manualResult');
    expect(columnNames).toContain('createdAt');
    expect(columnNames).toContain('updatedAt');
  });

  it('has id as primary key', () => {
    expect(candidates.id.primary).toBe(true);
  });

  it('uses snake_case column names for PostgreSQL compatibility', () => {
    expect(candidates.sourceType.name).toBe('source_type');
    expect(candidates.submittedByUserId.name).toBe('submitted_by_user_id');
    expect(candidates.teamId.name).toBe('team_id');
    expect(candidates.analysisSnapshot.name).toBe('analysis_snapshot');
    expect(candidates.duplicateCase.name).toBe('duplicate_case');
    expect(candidates.receivedAt.name).toBe('received_at');
    expect(candidates.queuedAt.name).toBe('queued_at');
    expect(candidates.analyzingAt.name).toBe('analyzing_at');
    expect(candidates.completedAt.name).toBe('completed_at');
    expect(candidates.lastError.name).toBe('last_error');
    expect(candidates.retryCount.name).toBe('retry_count');
    expect(candidates.manualResult.name).toBe('manual_result');
    expect(candidates.createdAt.name).toBe('created_at');
    expect(candidates.updatedAt.name).toBe('updated_at');
  });
});

describe('candidate sub-tables schema (Round 5)', () => {
  describe('candidate_analyses', () => {
    it('exports a candidateAnalyses pgTable', () => {
      expect(candidateAnalyses).toBeDefined();
      const columnNames = Object.keys(candidateAnalyses);
      expect(columnNames).toContain('candidateId');
      expect(columnNames).toContain('normalizedAt');
      expect(columnNames).toContain('fingerprint');
      expect(columnNames).toContain('keywords');
      expect(columnNames).toContain('tokens');
      expect(columnNames).toContain('createdAt');
    });

    it('has candidateId as primary key', () => {
      expect(candidateAnalyses.candidateId.primary).toBe(true);
    });

    it('uses snake_case column names', () => {
      expect(candidateAnalyses.candidateId.name).toBe('candidate_id');
      expect(candidateAnalyses.normalizedAt.name).toBe('normalized_at');
    });
  });

  describe('candidate_duplicate_cases', () => {
    it('exports a candidateDuplicateCases pgTable', () => {
      expect(candidateDuplicateCases).toBeDefined();
      const columnNames = Object.keys(candidateDuplicateCases);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('candidateId');
      expect(columnNames).toContain('detectedAt');
      expect(columnNames).toContain('detectionVersion');
      expect(columnNames).toContain('highestSimilarity');
      expect(columnNames).toContain('hasExactDuplicate');
      expect(columnNames).toContain('duplicateType');
      expect(columnNames).toContain('createdAt');
    });

    it('has id as primary key', () => {
      expect(candidateDuplicateCases.id.primary).toBe(true);
    });

    it('uses snake_case column names', () => {
      expect(candidateDuplicateCases.candidateId.name).toBe('candidate_id');
      expect(candidateDuplicateCases.detectedAt.name).toBe('detected_at');
      expect(candidateDuplicateCases.detectionVersion.name).toBe('detection_version');
      expect(candidateDuplicateCases.highestSimilarity.name).toBe('highest_similarity');
      expect(candidateDuplicateCases.hasExactDuplicate.name).toBe('has_exact_duplicate');
      expect(candidateDuplicateCases.duplicateType.name).toBe('duplicate_type');
    });
  });

  describe('candidate_duplicate_matches', () => {
    it('exports a candidateDuplicateMatches pgTable', () => {
      expect(candidateDuplicateMatches).toBeDefined();
      const columnNames = Object.keys(candidateDuplicateMatches);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('duplicateCaseId');
      expect(columnNames).toContain('entityType');
      expect(columnNames).toContain('entityId');
      expect(columnNames).toContain('entityTitle');
      expect(columnNames).toContain('similarityScore');
      expect(columnNames).toContain('matchType');
      expect(columnNames).toContain('sharedKeywords');
      expect(columnNames).toContain('sharedTokens');
      expect(columnNames).toContain('textOverlapPercent');
    });

    it('uses snake_case column names', () => {
      expect(candidateDuplicateMatches.duplicateCaseId.name).toBe('duplicate_case_id');
      expect(candidateDuplicateMatches.entityType.name).toBe('entity_type');
      expect(candidateDuplicateMatches.entityId.name).toBe('entity_id');
      expect(candidateDuplicateMatches.entityTitle.name).toBe('entity_title');
      expect(candidateDuplicateMatches.similarityScore.name).toBe('similarity_score');
      expect(candidateDuplicateMatches.matchType.name).toBe('match_type');
      expect(candidateDuplicateMatches.sharedKeywords.name).toBe('shared_keywords');
      expect(candidateDuplicateMatches.sharedTokens.name).toBe('shared_tokens');
      expect(candidateDuplicateMatches.textOverlapPercent.name).toBe('text_overlap_percent');
    });
  });

  describe('candidate_manual_results', () => {
    it('exports a candidateManualResults pgTable', () => {
      expect(candidateManualResults).toBeDefined();
      const columnNames = Object.keys(candidateManualResults);
      expect(columnNames).toContain('candidateId');
      expect(columnNames).toContain('decision');
      expect(columnNames).toContain('notes');
      expect(columnNames).toContain('mergedWithEntityType');
      expect(columnNames).toContain('mergedWithEntityId');
      expect(columnNames).toContain('mergedWithEntityTitle');
      expect(columnNames).toContain('submittedAt');
      expect(columnNames).toContain('submittedByUserId');
      expect(columnNames).toContain('createdAt');
    });

    it('has candidateId as primary key', () => {
      expect(candidateManualResults.candidateId.primary).toBe(true);
    });

    it('uses snake_case column names', () => {
      expect(candidateManualResults.candidateId.name).toBe('candidate_id');
      expect(candidateManualResults.mergedWithEntityType.name).toBe('merged_with_entity_type');
      expect(candidateManualResults.mergedWithEntityId.name).toBe('merged_with_entity_id');
      expect(candidateManualResults.mergedWithEntityTitle.name).toBe('merged_with_entity_title');
      expect(candidateManualResults.submittedAt.name).toBe('submitted_at');
      expect(candidateManualResults.submittedByUserId.name).toBe('submitted_by_user_id');
    });
  });

  describe('candidate_resolution_outcomes', () => {
    it('exports a candidateResolutionOutcomes pgTable', () => {
      expect(candidateResolutionOutcomes).toBeDefined();
      const columnNames = Object.keys(candidateResolutionOutcomes);
      expect(columnNames).toContain('candidateId');
      expect(columnNames).toContain('decision');
      expect(columnNames).toContain('publishedEntityId');
      expect(columnNames).toContain('mergedIntoEntityId');
      expect(columnNames).toContain('entityType');
      expect(columnNames).toContain('resolvedAt');
      expect(columnNames).toContain('resolvedBy');
      expect(columnNames).toContain('notes');
      expect(columnNames).toContain('createdAt');
    });

    it('has candidateId as primary key', () => {
      expect(candidateResolutionOutcomes.candidateId.primary).toBe(true);
    });
  });

  describe('entity_lineage', () => {
    it('exports an entityLineage pgTable', () => {
      expect(entityLineage).toBeDefined();
      const columnNames = Object.keys(entityLineage);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('candidateId');
      expect(columnNames).toContain('relationshipType');
      expect(columnNames).toContain('sourceType');
      expect(columnNames).toContain('sourceId');
      expect(columnNames).toContain('targetType');
      expect(columnNames).toContain('targetId');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('notes');
    });

    it('has id as primary key', () => {
      expect(entityLineage.id.primary).toBe(true);
    });

    it('uses snake_case column names', () => {
      expect(entityLineage.candidateId.name).toBe('candidate_id');
      expect(entityLineage.relationshipType.name).toBe('relationship_type');
      expect(entityLineage.sourceType.name).toBe('source_type');
      expect(entityLineage.sourceId.name).toBe('source_id');
      expect(entityLineage.targetType.name).toBe('target_type');
      expect(entityLineage.targetId.name).toBe('target_id');
    });
  });
});
