/**
 * Tests for ranking metric calculators.
 *
 * Task 2: Test Hit@K, MRR, nDCG, and Recall@K compute correctly from normalized hit IDs and the authored idealOrder.
 *
 * Phase 26-01: REVAL-03
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_TARGET_POLICY,
  averageMetrics,
  calculateMetrics,
  hitAtK,
  mrr,
  ndcg,
  recallAtK,
} from './metrics.js';
import type { NormalizedResult } from './types.js';

describe('metrics', () => {
  describe('EMPTY_TARGET_POLICY', () => {
    it('is defined as "zero" for reproducibility', () => {
      expect(EMPTY_TARGET_POLICY).toBe('zero');
    });
  });

  describe('hitAtK', () => {
    it('returns 1 when relevant ID appears in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_2'];

      expect(hitAtK(returnedIds, relevantIds, 1)).toBe(0); // id_2 not in top 1
      expect(hitAtK(returnedIds, relevantIds, 2)).toBe(1); // id_2 in top 2
      expect(hitAtK(returnedIds, relevantIds, 3)).toBe(1); // id_2 in top 3
    });

    it('returns 1 when multiple relevant IDs exist and one is in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3', 'id_4'];
      const relevantIds = ['id_3', 'id_5'];

      expect(hitAtK(returnedIds, relevantIds, 2)).toBe(0); // Neither in top 2
      expect(hitAtK(returnedIds, relevantIds, 3)).toBe(1); // id_3 in top 3
    });

    it('returns 0 when no relevant ID appears in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_4', 'id_5'];

      expect(hitAtK(returnedIds, relevantIds, 3)).toBe(0);
      expect(hitAtK(returnedIds, relevantIds, 10)).toBe(0);
    });

    it('returns 0 when no relevant IDs exist (empty target policy)', () => {
      expect(hitAtK(['id_1', 'id_2'], [], 3)).toBe(0);
    });

    it('handles empty returned IDs gracefully', () => {
      expect(hitAtK([], ['id_1'], 3)).toBe(0);
    });

    it('handles K larger than returned IDs', () => {
      const returnedIds = ['id_1'];
      const relevantIds = ['id_1'];

      expect(hitAtK(returnedIds, relevantIds, 10)).toBe(1);
    });
  });

  describe('mrr', () => {
    it('returns 1 when first relevant ID is at rank 1', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_1'];

      expect(mrr(returnedIds, relevantIds)).toBe(1);
    });

    it('returns 1/2 when first relevant ID is at rank 2', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_2'];

      expect(mrr(returnedIds, relevantIds)).toBe(0.5);
    });

    it('returns 1/3 when first relevant ID is at rank 3', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_3'];

      expect(mrr(returnedIds, relevantIds)).toBeCloseTo(1 / 3);
    });

    it('returns 0 when no relevant ID appears in results', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_4'];

      expect(mrr(returnedIds, relevantIds)).toBe(0);
    });

    it('returns 0 when no relevant IDs exist (empty target policy)', () => {
      expect(mrr(['id_1', 'id_2'], [])).toBe(0);
    });

    it('handles empty returned IDs gracefully', () => {
      expect(mrr([], ['id_1'])).toBe(0);
    });

    it('finds first among multiple relevant IDs', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3', 'id_4'];
      const relevantIds = ['id_4', 'id_2']; // id_2 appears first at rank 2

      expect(mrr(returnedIds, relevantIds)).toBe(0.5);
    });
  });

  describe('ndcg', () => {
    it('returns 1 when results are in ideal order', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_1', 'id_2', 'id_3'];
      const idealOrder = ['id_1', 'id_2', 'id_3'];

      expect(ndcg(returnedIds, relevantIds, idealOrder)).toBe(1);
    });

    it('returns lower score when results are not in ideal order', () => {
      // With binary relevance, order matters when we don't return all items
      // Return only top 2 in wrong order
      const returnedIds = ['id_3', 'id_2']; // id_3 first (should be last), id_2 second
      const relevantIds = ['id_1', 'id_2', 'id_3'];
      const idealOrder = ['id_1', 'id_2', 'id_3'];

      const score = ndcg(returnedIds, relevantIds, idealOrder);
      // DCG: 1/log2(2) + 1/log2(3) = 1 + 0.63 = 1.63
      // IDCG (from ideal order, top 2 of returned): 1/log2(2) + 1/log2(3) = 1.63
      // But we're comparing against the full ideal order:
      // IDCG (full): 1 + 0.63 + 0.5 = 2.13
      // nDCG = 1.63 / 2.13 ≈ 0.76
      expect(score).toBeLessThan(1);
      expect(score).toBeGreaterThan(0);
    });

    it('ignores non-relevant items in returned results', () => {
      const returnedIds = ['id_1', 'irrelevant', 'id_2'];
      const relevantIds = ['id_1', 'id_2'];
      const idealOrder = ['id_1', 'id_2'];

      // DCG: 1/log2(2) + 1/log2(4) = 1 + 0.5
      // IDCG: 1/log2(2) + 1/log2(3) = 1 + 0.63
      // nDCG ≈ 1.5 / 1.63 ≈ 0.92
      const score = ndcg(returnedIds, relevantIds, idealOrder);
      expect(score).toBeGreaterThan(0.9);
      expect(score).toBeLessThan(1);
    });

    it('returns 0 when no relevant IDs exist (empty target policy)', () => {
      expect(ndcg(['id_1', 'id_2'], [], ['id_1'])).toBe(0);
    });

    it('returns 0 when no relevant IDs appear in results', () => {
      const returnedIds = ['irrelevant_1', 'irrelevant_2'];
      const relevantIds = ['id_1'];

      expect(ndcg(returnedIds, relevantIds)).toBe(0);
    });

    it('uses relevantIds as ideal order when idealOrder not provided', () => {
      const returnedIds = ['id_1', 'id_2'];
      const relevantIds = ['id_1', 'id_2'];

      expect(ndcg(returnedIds, relevantIds)).toBe(1);
    });

    it('handles single relevant item correctly', () => {
      const returnedIds = ['id_1'];
      const relevantIds = ['id_1'];

      expect(ndcg(returnedIds, relevantIds)).toBe(1);
    });
  });

  describe('recallAtK', () => {
    it('returns 1 when all relevant IDs are in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_1', 'id_2'];

      expect(recallAtK(returnedIds, relevantIds, 3)).toBe(1);
    });

    it('returns 0.5 when half of relevant IDs are in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3', 'id_4'];
      const relevantIds = ['id_1', 'id_2', 'id_5', 'id_6'];

      expect(recallAtK(returnedIds, relevantIds, 4)).toBe(0.5);
    });

    it('returns 0 when no relevant IDs are in top K', () => {
      const returnedIds = ['id_1', 'id_2', 'id_3'];
      const relevantIds = ['id_4', 'id_5'];

      expect(recallAtK(returnedIds, relevantIds, 3)).toBe(0);
    });

    it('returns 0 when no relevant IDs exist (empty target policy)', () => {
      expect(recallAtK(['id_1', 'id_2'], [], 3)).toBe(0);
    });

    it('handles K larger than returned IDs', () => {
      const returnedIds = ['id_1'];
      const relevantIds = ['id_1', 'id_2'];

      expect(recallAtK(returnedIds, relevantIds, 10)).toBe(0.5);
    });

    it('counts duplicates correctly', () => {
      const returnedIds = ['id_1', 'id_1', 'id_2']; // id_1 appears twice
      const relevantIds = ['id_1'];

      expect(recallAtK(returnedIds, relevantIds, 3)).toBe(1);
    });
  });

  describe('calculateMetrics', () => {
    it('calculates all metrics from normalized result', () => {
      const result: NormalizedResult = {
        hits: [
          { id: 'id_1', score: 0.9, reason: 'match', scope: 'project' },
          { id: 'id_2', score: 0.8, reason: 'match', scope: 'project' },
          { id: 'id_3', score: 0.7, reason: 'match', scope: 'global' },
        ],
        returnedIds: ['id_1', 'id_2', 'id_3'],
        buckets: { globalConstraints: ['id_3'], projectKnowledge: ['id_1', 'id_2'] },
        profileHintArtifactIds: [],
        isEmpty: false,
        rawResponse: {},
        endpoint: '/v1/retrieval/search',
      };
      const relevantIds = ['id_1', 'id_2'];
      const idealOrder = ['id_1', 'id_2', 'id_3'];

      const metrics = calculateMetrics(result, relevantIds, idealOrder);

      expect(metrics.hitAt1).toBe(1);
      expect(metrics.hitAt5).toBe(1);
      expect(metrics.hitAt10).toBe(1);
      expect(metrics.mrr).toBe(1);
      expect(metrics.ndcg).toBeGreaterThan(0.9);
      expect(metrics.recallAt10).toBe(1);
    });

    it('returns zeros for empty relevant IDs (empty target policy)', () => {
      const result: NormalizedResult = {
        hits: [{ id: 'id_1', score: 0.9, reason: 'match', scope: 'project' }],
        returnedIds: ['id_1'],
        buckets: { globalConstraints: [], projectKnowledge: ['id_1'] },
        profileHintArtifactIds: [],
        isEmpty: false,
        rawResponse: {},
        endpoint: '/v1/retrieval/search',
      };

      const metrics = calculateMetrics(result, []);

      expect(metrics.hitAt1).toBe(0);
      expect(metrics.hitAt5).toBe(0);
      expect(metrics.hitAt10).toBe(0);
      expect(metrics.mrr).toBe(0);
      expect(metrics.ndcg).toBe(0);
      expect(metrics.recallAt10).toBe(0);
    });
  });

  describe('averageMetrics', () => {
    it('averages metrics across multiple cases', () => {
      const metrics1 = {
        hitAt1: 1,
        hitAt5: 1,
        hitAt10: 1,
        mrr: 1,
        ndcg: 1,
        recallAt10: 1,
      };
      const metrics2 = {
        hitAt1: 0,
        hitAt5: 1,
        hitAt10: 1,
        mrr: 0.5,
        ndcg: 0.8,
        recallAt10: 0.5,
      };

      const avg = averageMetrics([metrics1, metrics2]);

      expect(avg.hitAt1).toBe(0.5);
      expect(avg.hitAt5).toBe(1);
      expect(avg.hitAt10).toBe(1);
      expect(avg.mrr).toBe(0.75);
      expect(avg.ndcg).toBe(0.9);
      expect(avg.recallAt10).toBe(0.75);
    });

    it('returns zeros for empty metrics array', () => {
      const avg = averageMetrics([]);

      expect(avg.hitAt1).toBe(0);
      expect(avg.hitAt5).toBe(0);
      expect(avg.hitAt10).toBe(0);
      expect(avg.mrr).toBe(0);
      expect(avg.ndcg).toBe(0);
      expect(avg.recallAt10).toBe(0);
    });
  });
});
