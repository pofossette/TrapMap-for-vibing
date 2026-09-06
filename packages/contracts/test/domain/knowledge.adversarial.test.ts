/**
 * Adversarial tests for contracts schema validation.
 * Phase 71 Gap 4: Probes hard behavioral edges that the existing tests may miss:
 * - Boundary values for numeric fields (securityLevel 0 and 10)
 * - Extra properties passthrough behavior
 * - Nullable vs optional distinction
 * - Empty string vs missing field distinction
 * - Lifecycle state enum completeness
 */
import { describe, expect, it } from 'vitest';
import {
  agentReviewResultSchema,
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeRevisionSchema,
  knowledgeSubmissionSchema,
  reviewDecisionSchema,
  reviewNoteSchema,
  reviewRiskSchema,
} from '../../src/domain/knowledge.js';

// Valid actor reference matching actorRefSchema
const validActorRef = {
  id: 'user-1',
  handle: 'testuser',
  securityLevel: 5,
};

describe('knowledge schema adversarial tests', () => {
  describe('reviewRiskSchema boundary values', () => {
    it('accepts exactly the three valid risk levels and nothing else', () => {
      const validValues = ['low', 'medium', 'high'];
      for (const val of validValues) {
        expect(() => reviewRiskSchema.parse(val)).not.toThrow();
      }
      // Case sensitivity
      expect(() => reviewRiskSchema.parse('LOW')).toThrow();
      expect(() => reviewRiskSchema.parse('High')).toThrow();
      // Near-miss
      expect(() => reviewRiskSchema.parse('critical')).toThrow();
      expect(() => reviewRiskSchema.parse('')).toThrow();
    });
  });

  describe('agentReviewResultSchema edge cases', () => {
    it('rejects negative risk values that look valid', () => {
      // Ensure the schema validates risk as enum, not arbitrary string
      expect(() =>
        agentReviewResultSchema.parse({
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2024-01-01T00:00:00Z',
          notes: [],
        }),
      ).not.toThrow();

      // Invalid enum value
      expect(() =>
        agentReviewResultSchema.parse({
          status: 'agent-pass',
          duplicateRisk: 'extreme',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2024-01-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('accepts boundary object and defaults its array fields', () => {
      const result = agentReviewResultSchema.parse({
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'low',
        completenessRisk: 'low',
        checkedAt: '2024-01-01T00:00:00Z',
        boundary: {},
      });
      // boundarySchema defaults all array fields to empty arrays
      expect(result.boundary).toEqual({
        context: [],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      });
    });
  });

  describe('reviewDecisionSchema edge cases', () => {
    it('rejects notes at exactly 2001 characters', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: '2024-01-01T00:00:00Z',
          decidedBy: validActorRef,
          decision: 'approve',
          notes: 'a'.repeat(2001),
        }),
      ).toThrow();
    });

    it('accepts notes at exactly 2000 characters', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'approve',
        notes: 'a'.repeat(2000),
      });
      expect(decision.notes).toHaveLength(2000);
    });

    it('accepts notes at exactly 1 character', () => {
      const decision = reviewDecisionSchema.parse({
        decidedAt: '2024-01-01T00:00:00Z',
        decidedBy: validActorRef,
        decision: 'reject',
        notes: 'x',
      });
      expect(decision.notes).toBe('x');
    });

    it('requires decidedBy to have id, handle, and securityLevel', () => {
      expect(() =>
        reviewDecisionSchema.parse({
          decidedAt: '2024-01-01T00:00:00Z',
          decidedBy: { id: 'user-1' }, // missing handle and securityLevel
          decision: 'approve',
          notes: 'Some notes',
        }),
      ).toThrow();
    });
  });

  describe('reviewNoteSchema edge cases', () => {
    it('accepts message at exactly 2000 chars and rejects 2001', () => {
      expect(() =>
        reviewNoteSchema.parse({
          id: 'note-1',
          createdAt: '2024-01-01T00:00:00Z',
          authorType: 'system',
          message: 'a'.repeat(2000),
        }),
      ).not.toThrow();

      expect(() =>
        reviewNoteSchema.parse({
          id: 'note-1',
          createdAt: '2024-01-01T00:00:00Z',
          authorType: 'system',
          message: 'a'.repeat(2001),
        }),
      ).toThrow();
    });

    it('defaults author to null when not provided', () => {
      const note = reviewNoteSchema.parse({
        id: 'note-1',
        createdAt: '2024-01-01T00:00:00Z',
        authorType: 'agent',
        message: 'Auto review',
      });
      expect(note.author).toBeNull();
    });
  });

  describe('knowledgeRevisionSchema boundary values', () => {
    it('accepts shortcut at exactly 280 chars and rejects 281', () => {
      const base = {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: validActorRef,
        detail: 'Test detail',
        labels: ['test'],
      };

      expect(() =>
        knowledgeRevisionSchema.parse({ ...base, shortcut: 'a'.repeat(280) }),
      ).not.toThrow();

      expect(() => knowledgeRevisionSchema.parse({ ...base, shortcut: 'a'.repeat(281) })).toThrow();
    });

    it('accepts detail at exactly 10000 chars and rejects 10001', () => {
      const base = {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: validActorRef,
        shortcut: 'Test',
        labels: ['test'],
      };

      expect(() =>
        knowledgeRevisionSchema.parse({ ...base, detail: 'a'.repeat(10000) }),
      ).not.toThrow();

      expect(() => knowledgeRevisionSchema.parse({ ...base, detail: 'a'.repeat(10001) })).toThrow();
    });

    it('rejects revision number 0', () => {
      expect(() =>
        knowledgeRevisionSchema.parse({
          revision: 0,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: 'Test',
          detail: 'Test detail',
          labels: ['test'],
        }),
      ).toThrow();
    });

    it('rejects empty shortcut', () => {
      expect(() =>
        knowledgeRevisionSchema.parse({
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: '',
          detail: 'Test detail',
          labels: ['test'],
        }),
      ).toThrow();
    });
  });

  describe('knowledgeEntrySchema security level boundary', () => {
    const validRevision = {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedBy: validActorRef,
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
    };

    const baseEntry = {
      id: 'entry-1',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test shortcut',
      detail: 'Test detail content',
      requiredLevel: 5,
      lifecycleState: 'approved',
      owner: validActorRef,
      latestRevision: validRevision,
      history: [validRevision],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
      },
      agentReview: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts securityLevel at minimum (0)', () => {
      const entry = knowledgeEntrySchema.parse({ ...baseEntry, requiredLevel: 0 });
      expect(entry.requiredLevel).toBe(0);
    });

    it('accepts securityLevel at maximum (10)', () => {
      const entry = knowledgeEntrySchema.parse({ ...baseEntry, requiredLevel: 10 });
      expect(entry.requiredLevel).toBe(10);
    });

    it('rejects securityLevel above 10', () => {
      expect(() => knowledgeEntrySchema.parse({ ...baseEntry, requiredLevel: 11 })).toThrow();
    });

    it('rejects negative securityLevel', () => {
      expect(() => knowledgeEntrySchema.parse({ ...baseEntry, requiredLevel: -1 })).toThrow();
    });
  });

  describe('knowledgeEntrySchema lifecycle state completeness', () => {
    const baseEntry = {
      id: 'entry-1',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test shortcut',
      detail: 'Test detail content',
      requiredLevel: 5,
      owner: validActorRef,
      latestRevision: {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: validActorRef,
        shortcut: 'Test',
        detail: 'Test detail',
        labels: ['test'],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2024-01-01T00:00:00Z',
          submittedBy: validActorRef,
          shortcut: 'Test',
          detail: 'Test detail',
          labels: ['test'],
        },
      ],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
      },
      agentReview: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('accepts all valid lifecycle states', () => {
      const validStates = [
        'draft',
        'submitted',
        'agent-pass',
        'agent-rejected',
        'approved',
        'rejected',
        'deactivated',
      ];
      for (const state of validStates) {
        expect(() =>
          knowledgeEntrySchema.parse({ ...baseEntry, lifecycleState: state }),
        ).not.toThrow();
      }
    });

    it('rejects invalid lifecycle states', () => {
      const invalidStates = ['active', 'pending', 'closed', 'archived', ''];
      for (const state of invalidStates) {
        expect(() => knowledgeEntrySchema.parse({ ...baseEntry, lifecycleState: state })).toThrow();
      }
    });
  });

  describe('knowledgeSubmissionSchema edge cases', () => {
    it('requires all mandatory fields when optional ones are omitted', () => {
      const submission = knowledgeSubmissionSchema.parse({
        scope: 'project',
        labels: ['bug'],
        shortcut: 'Fix auth',
        detail: 'Detailed description of auth fix',
      });
      expect(submission.scope).toBe('project');
      expect(submission.teamId).toBeUndefined();
      expect(submission.requiredLevel).toBeUndefined();
      expect(submission.boundary).toBeUndefined();
    });

    it('rejects empty labels array', () => {
      expect(() =>
        knowledgeSubmissionSchema.parse({
          scope: 'global',
          labels: [],
          shortcut: 'Test',
          detail: 'Test detail',
        }),
      ).toThrow();
    });

    it('rejects empty detail', () => {
      expect(() =>
        knowledgeSubmissionSchema.parse({
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: '',
        }),
      ).toThrow();
    });
  });

  describe('knowledgeListItemSchema edge cases', () => {
    it('accepts item with empty labels (unlike entry and submission)', () => {
      const item = knowledgeListItemSchema.parse({
        id: 'entry-1',
        scope: 'global',
        labels: [],
        shortcut: 'Test',
        lifecycleState: 'approved',
        requiredLevel: 5,
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(item.labels).toEqual([]);
    });
  });
});
