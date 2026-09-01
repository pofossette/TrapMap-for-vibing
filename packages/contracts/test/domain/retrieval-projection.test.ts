import { describe, expect, it, vi } from 'vitest';

import {
  buildCachedRetrievalReadModel,
  buildCachedRetrievalReadModelFromRepositories,
  buildRetrievalReadProjection,
  createRetrievalKnowledgeFixtureParts,
} from '../../src/domain/retrieval-projection.js';

describe('buildRetrievalReadProjection', () => {
  it('loads and normalizes repository sources in parallel', async () => {
    const result = await buildRetrievalReadProjection(
      {
        listKnowledge: async () => ['knowledge'],
        listArtifacts: async () => ['artifact'],
        listFeedback: async () => ['feedback'],
        listConflicts: async () => ['conflict'],
      },
      {
        normalizeArtifact: (artifact) => artifact.toUpperCase(),
        attachFeedbackToKnowledge: (entries, feedback) => [...entries, ...feedback],
        attachFeedbackToArtifacts: (artifacts, feedback) => [...artifacts, ...feedback],
      },
    );

    expect(result).toEqual({
      knowledgeEntries: ['knowledge', 'feedback'],
      skillArtifacts: ['ARTIFACT', 'feedback'],
      conflicts: ['conflict'],
    });
  });

  it('returns a cached read model without loading repository sources', async () => {
    const cached = {
      knowledgeEntries: ['cached-knowledge'],
      skillArtifacts: ['cached-artifact'],
      conflicts: ['cached-conflict'],
    };
    const sources = {
      listKnowledge: vi.fn().mockResolvedValue(['knowledge']),
      listArtifacts: vi.fn().mockResolvedValue(['artifact']),
      listFeedback: vi.fn().mockResolvedValue(['feedback']),
      listConflicts: vi.fn().mockResolvedValue(['conflict']),
    };
    const set = vi.fn();

    const result = await buildCachedRetrievalReadModel({ get: () => cached, set }, sources, {
      normalizeArtifact: (artifact) => artifact,
      attachFeedbackToKnowledge: (entries) => entries,
      attachFeedbackToArtifacts: (artifacts) => artifacts,
    });

    expect(result).toBe(cached);
    expect(set).not.toHaveBeenCalled();
    expect(sources.listKnowledge).not.toHaveBeenCalled();
    expect(sources.listArtifacts).not.toHaveBeenCalled();
    expect(sources.listFeedback).not.toHaveBeenCalled();
    expect(sources.listConflicts).not.toHaveBeenCalled();
  });

  it('loads feedback and entry-scoped conflicts through the governance retrieval projection seam', async () => {
    const listFeedback = vi.fn().mockResolvedValue(['feedback']);
    const listConflicts = vi.fn().mockResolvedValue(['conflict']);
    const repositories = {
      knowledge: {
        listByFilter: vi.fn().mockResolvedValue([{ id: 'entry-1' }, { id: 'entry-2' }]),
      },
      artifact: {
        listByFilter: vi.fn().mockResolvedValue(['artifact']),
      },
      feedback: {
        listByFilter: vi.fn(async () => {
          throw new Error('legacy feedback repository should not be used');
        }),
      },
      conflict: {
        listAll: vi.fn(async () => {
          throw new Error('legacy conflict repository should not be used');
        }),
      },
    };

    const result = await buildCachedRetrievalReadModelFromRepositories(
      { get: () => null, set: vi.fn() },
      repositories,
      {
        listFeedback,
        listConflicts,
      },
      {
        normalizeArtifact: (artifact) => artifact,
        attachFeedbackToKnowledge: (entries) => entries,
        attachFeedbackToArtifacts: (artifacts) => artifacts,
      },
    );

    expect(result.conflicts).toEqual(['conflict']);
    expect(listFeedback).toHaveBeenCalledWith();
    expect(listConflicts).toHaveBeenCalledWith(['entry-1', 'entry-2']);
  });

  it('builds reusable knowledge fixture parts from caller-owned values', () => {
    expect(
      createRetrievalKnowledgeFixtureParts({
        now: '2026-01-01T00:00:00Z',
        shortcut: 'Shortcut',
        detail: 'Detail',
      }),
    ).toEqual({
      latestRevision: {
        revision: 1,
        submittedAt: '2026-01-01T00:00:00Z',
        submittedByUserId: 'user_1',
        shortcut: 'Shortcut',
        detail: 'Detail',
        labels: ['test'],
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
    });
  });
});
