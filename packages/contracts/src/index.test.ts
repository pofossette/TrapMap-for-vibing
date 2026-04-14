import { describe, expect, it } from 'vitest';

import {
  knowledgeEntrySchema,
  knowledgeSubmissionSchema,
  loginRequestSchema,
  retrievalQuerySchema,
  reviewDecisionRequestSchema,
  securityLevelSchema,
} from './index.js';

describe('contracts package', () => {
  it('accepts bounded security levels', () => {
    expect(securityLevelSchema.parse(10)).toBe(10);
    expect(() => securityLevelSchema.parse(11)).toThrow();
  });

  it('parses either login key shape', () => {
    expect(loginRequestSchema.parse({ accessKey: 'aaaaaaaaaaaaaaaa' })).toHaveProperty('accessKey');
    expect(loginRequestSchema.parse({ systemAdminKey: 'bbbbbbbbbbbbbbbb' })).toHaveProperty(
      'systemAdminKey',
    );
  });

  it('defaults retrieval query values', () => {
    const parsed = retrievalQuerySchema.parse({ seed: 'why does drizzle fail on pgvector' });

    expect(parsed.maxResults).toBe(10);
    expect(parsed.filters.labels).toEqual([]);
    expect(parsed.filters.scopes).toEqual([]);
  });

  it('requires a structured knowledge submission', () => {
    const parsed = knowledgeSubmissionSchema.parse({
      scope: 'project',
      labels: ['drizzle', 'pgvector'],
      shortcut: 'Use pgvector support through Drizzle SQL-first schema helpers.',
      detail: 'Prototype contract test ensures shape consistency across CLI and server.',
    });

    expect(parsed.labels).toHaveLength(2);
  });

  it('requires review notes for reviewer actions', () => {
    expect(() =>
      reviewDecisionRequestSchema.parse({
        entryId: 'entry-1',
        decision: 'reject',
        notes: '',
      }),
    ).toThrow();
  });

  it('models lifecycle metadata and submission history for knowledge entries', () => {
    const parsed = knowledgeEntrySchema.parse({
      id: 'knowledge_1',
      teamId: 'team_1',
      scope: 'project',
      labels: ['langchain', 'review'],
      shortcut: 'Keep rejected submissions linked to their prior attempt.',
      detail: 'Submission records retain agent review, reviewer output, and audit-friendly notes.',
      requiredLevel: 3,
      lifecycleState: 'rejected',
      owner: {
        id: 'user_1',
        handle: 'owner',
        securityLevel: 3,
      },
      latestRevision: {
        revision: 2,
        submittedAt: '2026-04-13T08:00:00.000Z',
        submittedBy: {
          id: 'user_1',
          handle: 'owner',
          securityLevel: 3,
        },
        shortcut: 'Keep rejected submissions linked to their prior attempt.',
        detail:
          'Submission records retain agent review, reviewer output, and audit-friendly notes.',
        labels: ['langchain', 'review'],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-04-13T07:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          shortcut: 'First attempt',
          detail: 'Initial detail',
          labels: ['langchain'],
        },
        {
          revision: 2,
          submittedAt: '2026-04-13T08:00:00.000Z',
          submittedBy: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          shortcut: 'Keep rejected submissions linked to their prior attempt.',
          detail:
            'Submission records retain agent review, reviewer output, and audit-friendly notes.',
          labels: ['langchain', 'review'],
        },
      ],
      metadata: {
        scopeLabel: 'project-knowledge',
        submissionCount: 2,
        resubmissionCount: 1,
        revisionCount: 2,
        latestSubmissionId: 'submission_2',
        latestSubmittedAt: '2026-04-13T08:00:00.000Z',
        latestReviewedAt: '2026-04-13T08:30:00.000Z',
        latestDecision: 'reject',
      },
      latestSubmission: {
        id: 'submission_2',
        revision: 2,
        submittedAt: '2026-04-13T08:00:00.000Z',
        submittedBy: {
          id: 'user_1',
          handle: 'owner',
          securityLevel: 3,
        },
        lifecycleState: 'rejected',
        resubmissionOf: 'submission_1',
        agentReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2026-04-13T08:10:00.000Z',
        },
        reviewerDecision: {
          decidedAt: '2026-04-13T08:30:00.000Z',
          decidedBy: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          decision: 'reject',
          notes: 'Needs one concrete repro step.',
        },
        reviewNotes: [
          {
            id: 'note_1',
            createdAt: '2026-04-13T08:30:00.000Z',
            authorType: 'reviewer',
            author: {
              id: 'user_2',
              handle: 'reviewer',
              securityLevel: 5,
            },
            message: 'Needs one concrete repro step.',
          },
        ],
      },
      submissionHistory: [],
      agentReview: {
        status: 'agent-pass',
        duplicateRisk: 'low',
        correctnessRisk: 'low',
        completenessRisk: 'low',
        checkedAt: '2026-04-13T08:10:00.000Z',
      },
      reviewHistory: [
        {
          decidedAt: '2026-04-13T08:30:00.000Z',
          decidedBy: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          decision: 'reject',
          notes: 'Needs one concrete repro step.',
        },
      ],
      reviewNotes: [
        {
          id: 'note_1',
          createdAt: '2026-04-13T08:30:00.000Z',
          authorType: 'reviewer',
          author: {
            id: 'user_2',
            handle: 'reviewer',
            securityLevel: 5,
          },
          message: 'Needs one concrete repro step.',
        },
      ],
      lifecycleHistory: [
        {
          id: 'event_1',
          type: 'submitted',
          createdAt: '2026-04-13T07:00:00.000Z',
          actor: {
            id: 'user_1',
            handle: 'owner',
            securityLevel: 3,
          },
          submissionId: 'submission_1',
          revision: 1,
          state: 'submitted',
          note: null,
        },
      ],
      createdAt: '2026-04-13T07:00:00.000Z',
      updatedAt: '2026-04-13T08:30:00.000Z',
    });

    expect(parsed.metadata.resubmissionCount).toBe(1);
    expect(parsed.latestSubmission?.reviewerDecision?.decision).toBe('reject');
  });
});
