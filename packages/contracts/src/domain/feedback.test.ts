import { describe, expect, it } from 'vitest';

import {
  feedbackProblemTypeSchema,
  feedbackSubmissionSchema,
  feedbackRecordSchema,
} from './feedback.js';

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
        customAnswers: [
          { prompt: 'What version were you using?', answer: 'v1.2.3' },
        ],
      });
      expect(result.customAnswers).toHaveLength(1);
      expect(result.customAnswers?.[0]?.prompt).toBe('What version were you using?');
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
      const result = feedbackRecordSchema.parse(validRecord);
      expect(result.id).toBe('feedback-456');
      expect(result.submittedAt).toBe('2026-05-02T10:00:00Z');
      expect(result.submittedBy.handle).toBe('testuser');
      expect(result.status).toBe('new');
    });

    it('default status is NOT automatically set (status is required)', () => {
      const { status, ...missingStatus } = validRecord;
      expect(() => feedbackRecordSchema.parse(missingStatus)).toThrow();
    });
  });
});
