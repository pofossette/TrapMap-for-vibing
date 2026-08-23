import { describe, expect, it } from 'vitest';
import { reviewDecisionRequestSchema, reviewQueueQuerySchema } from './review.js';
import { reviewQueueResponseSchema } from './review.js';

describe('review schema contracts', () => {
  describe('reviewDecisionRequestSchema', () => {
    const baseRequest = {
      entryId: 'entry-1',
      decision: 'approve' as const,
      notes: 'Looks good',
    };

    it('accepts null boundary', () => {
      const request = reviewDecisionRequestSchema.parse({
        ...baseRequest,
        boundary: null,
      });
      expect(request.boundary).toBeNull();
    });

    it('accepts valid boundary object', () => {
      const request = reviewDecisionRequestSchema.parse({
        ...baseRequest,
        boundary: { context: ['frontend'], versions: [] },
      });
      expect(request.boundary).toBeDefined();
      expect(request.boundary?.context).toEqual(['frontend']);
    });

    it('accepts omitted boundary (optional since boundary can be absent)', () => {
      expect(() => reviewDecisionRequestSchema.parse(baseRequest)).not.toThrow();
    });

    it('normalizes lifecycle-state decision aliases for API compatibility', () => {
      expect(
        reviewDecisionRequestSchema.parse({
          ...baseRequest,
          decision: 'approved',
        }).decision,
      ).toBe('approve');
      expect(
        reviewDecisionRequestSchema.parse({
          ...baseRequest,
          decision: 'rejected',
        }).decision,
      ).toBe('reject');
    });

    it('accepts evidence without verifiedAt/verifiedBy for server-side backfill', () => {
      const request = reviewDecisionRequestSchema.parse({
        ...baseRequest,
        evidence: {
          sourceType: 'incident',
          evidenceLevel: 'documented',
          sourceRef: 'INC-123',
        },
      });

      expect(request.evidence?.sourceType).toBe('incident');
      expect(request.evidence?.verifiedAt).toBeUndefined();
      expect(request.evidence?.verifiedBy).toBeUndefined();
    });
  });

  describe('reviewQueueQuerySchema', () => {
    it('accepts valid query with known fields', () => {
      const query = reviewQueueQuerySchema.parse({
        status: 'submitted',
        teamId: 'team-1',
        limit: 10,
      });
      expect(query.status).toBe('submitted');
      expect(query.teamId).toBe('team-1');
    });

    it('accepts empty query with defaults', () => {
      const query = reviewQueueQuerySchema.parse({});
      expect(query).toMatchObject({ limit: 25, sort: 'highest-risk' });
    });

    it('accepts panel filters and canonical server sort', () => {
      const query = reviewQueueQuerySchema.parse({
        status: 'submitted',
        search: 'schema drift',
        source: 'candidate-ingestion',
        riskLevel: 'high',
        sort: 'longest-waiting',
        limit: 25,
      });

      expect(query).toMatchObject({
        status: 'submitted',
        search: 'schema drift',
        source: 'candidate-ingestion',
        riskLevel: 'high',
        sort: 'longest-waiting',
      });
    });

    it('rejects extra fields (strict mode)', () => {
      expect(() =>
        reviewQueueQuerySchema.parse({
          status: 'submitted',
          unknownField: 'should fail',
        }),
      ).toThrow();
    });
  });

  describe('reviewQueueResponseSchema', () => {
    it('requires distinct filtered and authorized totals', () => {
      const response = reviewQueueResponseSchema.parse({
        items: [],
        nextCursor: null,
        filteredTotal: 2,
        total: 9,
      });

      expect(response.filteredTotal).toBe(2);
      expect(response.total).toBe(9);
    });
  });

  it('accepts return-for-correction as a distinct review decision', () => {
    const request = reviewDecisionRequestSchema.parse({
      entryId: 'entry-1',
      decision: 'return-for-correction',
      notes: 'please revise the schema',
    });

    expect(request.decision).toBe('return-for-correction');
  });
});
