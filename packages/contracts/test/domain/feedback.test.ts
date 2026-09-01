import { describe, expect, it } from 'vitest';

import {
  feedbackBatchItemSchema,
  feedbackBatchResponseSchema,
  feedbackCustomAnswerSchema,
  feedbackListItemSchema,
  feedbackProblemTypeSchema,
  feedbackRecordSchema,
  feedbackSubmissionSchema,
  qualityScoreSchema,
} from '../../src/domain/feedback.js';
import { BADCASE_TAXONOMY_VALUES } from '../../src/enum-types/badcase-taxonomy.js';

describe('feedback schema', () => {
  describe('feedbackProblemTypeSchema', () => {
    it('accepts all valid problem types', () => {
      const validTypes = ['incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other'];
      for (const type of validTypes) {
        expect(feedbackProblemTypeSchema.parse(type)).toBe(type);
      }
    });

    it('rejects invalid problem type strings', () => {
      expect(() => feedbackProblemTypeSchema.parse('invalid-type')).toThrow();
      expect(() => feedbackProblemTypeSchema.parse('')).toThrow();
    });
  });

  describe('feedbackSubmissionSchema', () => {
    const validSubmission = {
      entryId: 'entry-123',
      entryType: 'trap' as const,
      problemType: 'incorrect' as const,
      description: 'This solution has an error in the code example.',
    };

    it('accepts valid submission with required fields', () => {
      const result = feedbackSubmissionSchema.parse(validSubmission);
      expect(result.entryId).toBe('entry-123');
      expect(result.entryType).toBe('trap');
      expect(result.problemType).toBe('incorrect');
      expect(result.description).toBe('This solution has an error in the code example.');
    });

    it('accepts submission with optional context field', () => {
      const result = feedbackSubmissionSchema.parse({
        ...validSubmission,
        context: 'I was trying to fix a bug in production.',
      });
      expect(result.context).toBe('I was trying to fix a bug in production.');
    });

    it('accepts submission with customAnswers array', () => {
      const result = feedbackSubmissionSchema.parse({
        ...validSubmission,
        customAnswers: [{ prompt: 'What version were you using?', answer: 'v1.2.3' }],
      });
      expect(result.customAnswers).toHaveLength(1);
      expect(result.customAnswers?.[0]?.prompt).toBe('What version were you using?');
    });

    it('accepts additive badcase reproducibility fields', () => {
      const result = feedbackSubmissionSchema.parse({
        ...validSubmission,
        badcase: {
          queryId: 'qry_test_1',
          querySeed: 'library version issue',
          routeFamily: 'entry',
          failureClassification: 'stale-content',
          expectedCorrection: 'Return current docs',
          selectedResultSnapshot: {
            entryId: 'entry-123',
            entryType: 'trap',
            title: 'Trap title',
            score: 0.8,
            routeFamily: 'entry',
          },
        },
      });
      expect(result.badcase?.queryId).toBe('qry_test_1');
      expect(result.badcase?.failureClassification).toBe('stale-content');
    });

    it('normalizes legacy badcase taxonomy aliases to canonical values', () => {
      const result = feedbackSubmissionSchema.parse({
        ...validSubmission,
        badcase: {
          failureClassification: 'outdated-content',
        },
      });

      expect(result.badcase?.failureClassification).toBe('stale-content');
    });

    it('accepts the full canonical badcase taxonomy', () => {
      for (const classification of BADCASE_TAXONOMY_VALUES) {
        const result = feedbackSubmissionSchema.parse({
          ...validSubmission,
          badcase: {
            failureClassification: classification,
          },
        });
        expect(result.badcase?.failureClassification).toBe(classification);
      }
    });

    it('rejects submission with description shorter than 10 characters', () => {
      expect(() =>
        feedbackSubmissionSchema.parse({
          ...validSubmission,
          description: 'too short',
        }),
      ).toThrow(/Description must be at least 10 characters/);
    });

    it('rejects submission with description longer than 2000 characters', () => {
      const longDescription = 'a'.repeat(2001);
      expect(() =>
        feedbackSubmissionSchema.parse({
          ...validSubmission,
          description: longDescription,
        }),
      ).toThrow();
    });

    it('rejects submission with context longer than 1000 characters', () => {
      const longContext = 'a'.repeat(1001);
      expect(() =>
        feedbackSubmissionSchema.parse({
          ...validSubmission,
          context: longContext,
        }),
      ).toThrow();
    });

    it('rejects submission with missing required fields', () => {
      const { entryId, ...missingEntryId } = validSubmission;
      expect(() => feedbackSubmissionSchema.parse(missingEntryId)).toThrow();

      const { entryType, ...missingEntryType } = validSubmission;
      expect(() => feedbackSubmissionSchema.parse(missingEntryType)).toThrow();

      const { problemType, ...missingProblemType } = validSubmission;
      expect(() => feedbackSubmissionSchema.parse(missingProblemType)).toThrow();

      const { description, ...missingDescription } = validSubmission;
      expect(() => feedbackSubmissionSchema.parse(missingDescription)).toThrow();
    });
  });

  describe('feedbackRecordSchema', () => {
    const validRecord = {
      entryId: 'entry-123',
      entryType: 'trap' as const,
      problemType: 'incorrect' as const,
      description: 'This solution has an error in the code example.',
      id: 'feedback-456',
      submittedAt: '2026-05-02T10:00:00Z',
      submittedBy: {
        id: 'user-789',
        handle: 'testuser',
        securityLevel: 5,
      },
      status: 'new' as const,
    };

    it('accepts record with all fields including id, submittedAt, submittedBy, status', () => {
      const result = feedbackRecordSchema.parse({
        ...validRecord,
        queryId: 'qry_test_1',
        routeFamily: 'entry',
      });
      expect(result.id).toBe('feedback-456');
      expect(result.submittedAt).toBe('2026-05-02T10:00:00Z');
      expect(result.submittedBy.handle).toBe('testuser');
      expect(result.status).toBe('new');
      expect(result.queryId).toBe('qry_test_1');
    });

    it('default status is NOT automatically set (status is required)', () => {
      const { status, ...missingStatus } = validRecord;
      expect(() => feedbackRecordSchema.parse(missingStatus)).toThrow();
    });
  });

  describe('feedbackCustomAnswerSchema (strict)', () => {
    it('accepts valid custom answer', () => {
      const result = feedbackCustomAnswerSchema.parse({ prompt: 'What version?', answer: 'v2' });
      expect(result.prompt).toBe('What version?');
    });

    it('rejects objects with extra properties', () => {
      expect(() =>
        feedbackCustomAnswerSchema.parse({ prompt: 'What version?', answer: 'v2', extra: 'nope' }),
      ).toThrow();
    });
  });

  describe('feedbackListItemSchema (description .min(1))', () => {
    const validItem = {
      id: 'fb-1',
      entryId: 'entry-1',
      entryType: 'trap' as const,
      entryShortcut: 'trap-1',
      problemType: 'incorrect' as const,
      description: 'A real description',
      context: null,
      submittedAt: '2026-05-02T10:00:00Z',
      submittedBy: { id: 'user-1', handle: 'u', securityLevel: 5 },
      status: 'new' as const,
      ageDays: 3,
      adminNotes: null,
    };

    it('accepts non-empty description', () => {
      expect(feedbackListItemSchema.parse(validItem).description).toBe('A real description');
    });

    it('rejects empty string description', () => {
      expect(() => feedbackListItemSchema.parse({ ...validItem, description: '' })).toThrow();
    });
  });

  describe('feedbackBatchItemSchema (conditional reason constraint)', () => {
    it('accepts eligible=true with reason=null', () => {
      const result = feedbackBatchItemSchema.parse({
        feedbackId: 'fb-1',
        eligible: true,
        reason: null,
        transitionApplied: false,
      });
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('rejects eligible=true with non-null reason', () => {
      expect(() =>
        feedbackBatchItemSchema.parse({
          feedbackId: 'fb-1',
          eligible: true,
          reason: 'some reason',
          transitionApplied: false,
        }),
      ).toThrow(/reason must be null when eligible is true/);
    });

    it('accepts eligible=false with non-null reason', () => {
      const result = feedbackBatchItemSchema.parse({
        feedbackId: 'fb-1',
        eligible: false,
        reason: 'not applicable',
        transitionApplied: false,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('not applicable');
    });

    it('rejects eligible=false with reason=null', () => {
      expect(() =>
        feedbackBatchItemSchema.parse({
          feedbackId: 'fb-1',
          eligible: false,
          reason: null,
          transitionApplied: false,
        }),
      ).toThrow(/reason must be non-null when eligible is false/);
    });
  });

  describe('feedbackBatchResponseSchema (strict)', () => {
    const validResponse = {
      action: 'resolve' as const,
      dryRun: false,
      items: [],
      totalEligible: 0,
      totalIneligible: 0,
      appliedAt: '2026-05-02T10:00:00Z',
    };

    it('accepts valid response', () => {
      expect(feedbackBatchResponseSchema.parse(validResponse).action).toBe('resolve');
    });

    it('rejects objects with extra properties', () => {
      expect(() =>
        feedbackBatchResponseSchema.parse({ ...validResponse, extra: 'nope' }),
      ).toThrow();
    });
  });

  describe('qualityScoreSchema (relationship constraints)', () => {
    const validScore = {
      totalFeedback: 10,
      unresolvedFeedback: 3,
      outdatedReports: 2,
      incorrectReports: 1,
      qualityScore: 0.7,
      lastFeedbackAt: '2026-05-02T10:00:00Z',
    };

    it('accepts valid quality score', () => {
      expect(qualityScoreSchema.parse(validScore).qualityScore).toBe(0.7);
    });

    it('rejects unresolvedFeedback > totalFeedback', () => {
      expect(() => qualityScoreSchema.parse({ ...validScore, unresolvedFeedback: 15 })).toThrow(
        /unresolvedFeedback must not exceed totalFeedback/,
      );
    });

    it('rejects outdatedReports + incorrectReports > totalFeedback', () => {
      expect(() =>
        qualityScoreSchema.parse({ ...validScore, outdatedReports: 6, incorrectReports: 6 }),
      ).toThrow(/outdatedReports \+ incorrectReports must not exceed totalFeedback/);
    });

    it('accepts when unresolvedFeedback equals totalFeedback', () => {
      const result = qualityScoreSchema.parse({ ...validScore, unresolvedFeedback: 10 });
      expect(result.unresolvedFeedback).toBe(10);
    });

    it('accepts when outdated + incorrect equals totalFeedback', () => {
      const result = qualityScoreSchema.parse({
        ...validScore,
        outdatedReports: 6,
        incorrectReports: 4,
      });
      expect(result.outdatedReports + result.incorrectReports).toBe(10);
    });
  });
});
