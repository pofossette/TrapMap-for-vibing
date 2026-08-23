import { describe, expect, it } from 'vitest';
import {
  agentReviewResultSchema,
  agentReviewStatusSchema,
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeMetadataSchema,
  knowledgeResubmissionSchema,
  knowledgeRevisionSchema,
  knowledgeSubmissionSchema,
  reviewDecisionSchema,
  reviewNoteSchema,
  reviewRiskSchema,
} from './knowledge.js';

// Valid actor reference matching actorRefSchema
const validActorRef = {
  id: 'user-1',
  handle: 'testuser',
  securityLevel: 5,
};

describe('knowledge schema contracts', () => {
  describe('reviewRiskSchema', () => {
    it('accepts valid risk levels (low, medium, high)', () => {
      expect(reviewRiskSchema.parse('low')).toBe('low');
      expect(reviewRiskSchema.parse('medium')).toBe('medium');
      expect(reviewRiskSchema.parse('high')).toBe('high');
    });

    it('rejects invalid risk level', () => {
      expect(() => reviewRiskSchema.parse('invalid')).toThrow();
    });
  });

  describe('agentReviewStatusSchema', () => {
    it('accepts valid statuses (agent-pass, agent-rejected)', () => {
      expect(agentReviewStatusSchema.parse('agent-pass')).toBe('agent-pass');
      expect(agentReviewStatusSchema.parse('agent-rejected')).toBe('agent-rejected');
    });

    it('rejects invalid status', () => {
      expect(() => agentReviewStatusSchema.parse('invalid')).toThrow();
    });
  });

  describe('agentReviewResultSchema', () => {
    it('accepts complete result with all fields', () => {
      const result = agentReviewResultSchema.parse({
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'medium',
        completenessRisk: 'high',
        checkedAt: '2024-01-01T00:00:00Z',
        notes: ['All good'],
        boundary: null,
      });
      expect(result.status).toBe('agent-pass');
      expect(result.duplicateRisk).toBe('low');
      expect(result.correctnessRisk).toBe('medium');
      expect(result.completenessRisk).toBe('high');
    });

    it('defaults notes to empty array', () => {
      const result = agentReviewResultSchema.parse({
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'low',
        completenessRisk: 'low',
        checkedAt: '2024-01-01T00:00:00Z',
      });
      expect(result.notes).toEqual([]);
    });

    it('accepts null boundary', () => {
      const result = agentReviewResultSchema.parse({
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'low',
        completenessRisk: 'low',
        checkedAt: '2024-01-01T00:00:00Z',
        boundary: null,
      });
      expect(result.boundary).toBeNull();
    });

    it('rejects missing required fields', () => {
      expect(() =>
        agentReviewResultSchema.parse({
          status: 'agent-pass',
          // missing risk fields
          checkedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('rejects invalid risk values', () => {
      expect(() =>
        agentReviewResultSchema.parse({
          status: 'agent-pass',
          duplicateRisk: 'invalid',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });
  });

  describe('reviewDecisionSchema', () => {
    it('accepts approve decision with notes', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'approve',
        notes: 'Looks good to me',
      });
      expect(decision.decision).toBe('approve');
      expect(decision.notes).toBe('Looks good to me');
    });

    it('accepts reject decision with notes', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'reject',
        notes: 'Needs more detail',
      });
      expect(decision.decision).toBe('reject');
    });

    it('accepts return-for-correction as a distinct decision record', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'return-for-correction',
        notes: 'Needs boundary details',
      });

      expect(decision.decision).toBe('return-for-correction');
    });

    it('rejects empty notes', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: '2024-01-01T00:00:00Z',
          decidedBy: validActorRef,
          decision: 'approve',
          notes: '',
        }),
      ).toThrow();
    });

    it('rejects invalid decision', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: '2024-01-01T00:00:00Z',
          decidedBy: validActorRef,
          decision: 'invalid',
          notes: 'Some notes',
        }),
      ).toThrow();
    });
  });

  describe('reviewNoteSchema', () => {
    it('accepts note with all fields', () => {
      const note = reviewNoteSchema.parse({
        id: 'note-1',
        createdAt: '2024-01-01T00:00:00Z',
        authorType: 'reviewer',
        author: validActorRef,
        message: 'Please clarify the error handling',
      });
      expect(note.id).toBe('note-1');
      expect(note.authorType).toBe('reviewer');
      expect(note.message).toBe('Please clarify the error handling');
    });

    it('defaults author to null', () => {
      const note = reviewNoteSchema.parse({
        id: 'note-1',
        createdAt: '2024-01-01T00:00:00Z',
        authorType: 'system',
        message: 'Auto-generated note',
      });
      expect(note.author).toBeNull();
    });

    it('accepts all authorType values', () => {
      const authorTypes = ['submitter', 'agent', 'reviewer', 'system'] as const;
      for (const authorType of authorTypes) {
        const note = reviewNoteSchema.parse({
          id: 'note-1',
          createdAt: '2024-01-01T00:00:00Z',
          authorType,
          message: 'Test note',
        });
        expect(note.authorType).toBe(authorType);
      }
    });

    it('rejects empty message', () => {
      expect(() =>
        reviewNoteSchema.parse({
          id: 'note-1',
          createdAt: '2024-01-01T00:00:00Z',
          authorType: 'reviewer',
          message: '',
        }),
      ).toThrow();
    });

    it('rejects message over 2000 chars', () => {
      expect(() =>
        reviewNoteSchema.parse({
          id: 'note-1',
          createdAt: '2024-01-01T00:00:00Z',
          authorType: 'reviewer',
          message: 'a'.repeat(2001),
        }),
      ).toThrow();
    });
  });

  describe('knowledgeRevisionSchema', () => {
    it('accepts valid revision', () => {
      const revision = knowledgeRevisionSchema.parse({
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: validActorRef,
        shortcut: 'Fix login bug',
        detail: 'Updated the authentication logic to handle edge cases',
        labels: ['auth', 'bug'],
      });
      expect(revision.revision).toBe(1);
      expect(revision.shortcut).toBe('Fix login bug');
      expect(revision.labels).toHaveLength(2);
    });

    it('requires at least one label', () => {
      expect(() =>
        knowledgeRevisionSchema.parse({
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: 'Test',
          detail: 'Test detail',
          labels: [],
        }),
      ).toThrow();
    });

    it('rejects shortcut over 280 chars', () => {
      expect(() =>
        knowledgeRevisionSchema.parse({
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: 'a'.repeat(281),
          detail: 'Test detail',
          labels: ['test'],
        }),
      ).toThrow();
    });

    it('rejects detail over 10000 chars', () => {
      expect(() =>
        knowledgeRevisionSchema.parse({
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: 'Test',
          detail: 'a'.repeat(10001),
          labels: ['test'],
        }),
      ).toThrow();
    });

    it('defaults reviewNotes to empty array', () => {
      const revision = knowledgeRevisionSchema.parse({
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: validActorRef,
        shortcut: 'Test',
        detail: 'Test detail',
        labels: ['test'],
      });
      expect(revision.reviewNotes).toEqual([]);
    });
  });

  describe('knowledgeEntrySchema', () => {
    const validRevision = {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedBy: validActorRef,
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    };

    const validEntry = {
      id: 'entry-1',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test shortcut',
      detail: 'Test detail content',
      requiredLevel: 5, // securityLevelSchema is number 0-10
      lifecycleState: 'approved', // valid lifecycle state
      owner: validActorRef,
      latestRevision: validRevision,
      history: [validRevision],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
      },
      agentReview: null, // must be explicit null, not undefined
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts complete entry with all fields', () => {
      const entry = knowledgeEntrySchema.parse(validEntry);
      expect(entry.id).toBe('entry-1');
      expect(entry.scope).toBe('global');
      expect(entry.labels).toHaveLength(1);
    });

    it('requires at least one label', () => {
      expect(() =>
        knowledgeEntrySchema.parse({
          ...validEntry,
          labels: [],
        }),
      ).toThrow();
    });

    it('requires non-empty history', () => {
      expect(() =>
        knowledgeEntrySchema.parse({
          ...validEntry,
          history: [],
        }),
      ).toThrow();
    });

    it('defaults optional fields (boundary, evidenceMeta, maintenanceMeta)', () => {
      const entry = knowledgeEntrySchema.parse(validEntry);
      expect(entry.boundary).toBeNull();
      expect(entry.evidenceMeta).toBeNull();
      expect(entry.maintenanceMeta).toBeNull();
    });

    it('rejects invalid lifecycleState', () => {
      expect(() =>
        knowledgeEntrySchema.parse({
          ...validEntry,
          lifecycleState: 'invalid',
        }),
      ).toThrow();
    });

    it('accepts entry with agentReview null', () => {
      const entry = knowledgeEntrySchema.parse({
        ...validEntry,
        agentReview: null,
      });
      expect(entry.agentReview).toBeNull();
    });

    it('merges auditMetadata fields', () => {
      const entry = knowledgeEntrySchema.parse(validEntry);
      expect(entry.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(entry.updatedAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('knowledgeSubmissionSchema', () => {
    it('accepts valid submission', () => {
      const submission = knowledgeSubmissionSchema.parse({
        teamId: 'team-1',
        scope: 'global',
        labels: ['auth'],
        shortcut: 'Fix login issue',
        detail: 'Detailed description of the fix',
        requiredLevel: 5,
      });
      expect(submission.scope).toBe('global');
      expect(submission.labels).toHaveLength(1);
    });

    it('makes teamId optional', () => {
      const submission = knowledgeSubmissionSchema.parse({
        scope: 'global',
        labels: ['auth'],
        shortcut: 'Fix login issue',
        detail: 'Detailed description',
      });
      expect(submission.teamId).toBeUndefined();
    });

    it('makes requiredLevel optional', () => {
      const submission = knowledgeSubmissionSchema.parse({
        scope: 'global',
        labels: ['auth'],
        shortcut: 'Fix login issue',
        detail: 'Detailed description',
      });
      expect(submission.requiredLevel).toBeUndefined();
    });

    it('makes boundary optional', () => {
      const submission = knowledgeSubmissionSchema.parse({
        scope: 'global',
        labels: ['auth'],
        shortcut: 'Fix login issue',
        detail: 'Detailed description',
      });
      expect(submission.boundary).toBeUndefined();
    });

    it('requires at least one label', () => {
      expect(() =>
        knowledgeSubmissionSchema.parse({
          scope: 'global',
          labels: [],
          shortcut: 'Test',
          detail: 'Test detail',
        }),
      ).toThrow();
    });
  });

  describe('knowledgeListItemSchema', () => {
    it('accepts valid list item', () => {
      const item = knowledgeListItemSchema.parse({
        id: 'entry-1',
        scope: 'global',
        labels: ['auth', 'bug'],
        shortcut: 'Fix login',
        lifecycleState: 'approved',
        requiredLevel: 5,
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(item.id).toBe('entry-1');
      expect(item.scope).toBe('global');
    });

    it('defaults evidenceMeta to null', () => {
      const item = knowledgeListItemSchema.parse({
        id: 'entry-1',
        scope: 'global',
        labels: ['auth'],
        shortcut: 'Fix login',
        lifecycleState: 'approved',
        requiredLevel: 5,
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(item.evidenceMeta).toBeNull();
    });

    it('requires valid lifecycleState', () => {
      expect(() =>
        knowledgeListItemSchema.parse({
          id: 'entry-1',
          scope: 'global',
          labels: ['auth'],
          shortcut: 'Fix login',
          lifecycleState: 'invalid',
          requiredLevel: 5,
          updatedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('accepts empty labels array', () => {
      const item = knowledgeListItemSchema.parse({
        id: 'entry-1',
        scope: 'global',
        labels: [],
        shortcut: 'Fix login',
        lifecycleState: 'approved',
        requiredLevel: 5,
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(item.labels).toEqual([]);
    });

    it('rejects non-ISO timestamp for updatedAt', () => {
      expect(() =>
        knowledgeListItemSchema.parse({
          id: 'entry-1',
          scope: 'global',
          labels: ['test'],
          shortcut: 'Fix login',
          lifecycleState: 'approved',
          requiredLevel: 5,
          updatedAt: 'not-a-timestamp',
        }),
      ).toThrow();
    });

    it('rejects plain date string for updatedAt', () => {
      expect(() =>
        knowledgeListItemSchema.parse({
          id: 'entry-1',
          scope: 'global',
          labels: ['test'],
          shortcut: 'Fix login',
          lifecycleState: 'approved',
          requiredLevel: 5,
          updatedAt: '2024-01-01',
        }),
      ).toThrow();
    });
  });

  describe('reviewDecisionSchema timestamp validation', () => {
    it('rejects non-ISO timestamp for decidedAt', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: 'not-a-timestamp',
          decidedBy: validActorRef,
          decision: 'approve',
          notes: 'Looks good',
        }),
      ).toThrow();
    });

    it('rejects plain date string for decidedAt', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: '2024-01-01',
          decidedBy: validActorRef,
          decision: 'approve',
          notes: 'Looks good',
        }),
      ).toThrow();
    });

    it('accepts valid ISO timestamp for decidedAt', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'approve',
        notes: 'Looks good',
      });
      expect(decision.decidedAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('knowledgeResubmissionSchema boundary validation', () => {
    const baseResubmission = {
      entryId: 'entry-1',
      labels: ['auth'],
      shortcut: 'Fix login',
      detail: 'Updated fix',
    };

    it('accepts valid boundary object', () => {
      const resub = knowledgeResubmissionSchema.parse({
        ...baseResubmission,
        boundary: { context: ['frontend'] },
      });
      expect(resub.boundary).toBeDefined();
    });

    it('accepts omitted boundary (optional)', () => {
      const resub = knowledgeResubmissionSchema.parse(baseResubmission);
      expect(resub.boundary).toBeUndefined();
    });

    it('accepts null boundary (nullable, consistent with submission schema)', () => {
      const resub = knowledgeResubmissionSchema.parse({
        ...baseResubmission,
        boundary: null,
      });
      expect(resub.boundary).toBeNull();
    });
  });

  describe('knowledgeMetadataSchema invariants', () => {
    const makeMetadata = () => ({
      scopeLabel: 'project-knowledge' as const,
      submissionCount: 5,
      resubmissionCount: 3,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: '2024-01-15T10:30:00.000Z',
      latestReviewedAt: '2024-01-15T10:30:00.000Z'.toString(),
      latestDecision: 'approve' as const,
    });

    it('rejects submissionCount < resubmissionCount', () => {
      expect(() =>
        knowledgeMetadataSchema.parse({
          ...makeMetadata(),
          submissionCount: 1,
          resubmissionCount: 5,
        }),
      ).toThrow();
    });
  });
});
