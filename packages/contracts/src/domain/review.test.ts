import { describe, expect, it } from 'vitest';
import { reviewDecisionRequestSchema, reviewQueueQuerySchema } from './review.js';

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

    it('rejects omitted boundary (must be T|null, not T|undefined)', () => {
      expect(() => reviewDecisionRequestSchema.parse(baseRequest)).toThrow();
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
      expect(query.limit).toBe(25);
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
});
