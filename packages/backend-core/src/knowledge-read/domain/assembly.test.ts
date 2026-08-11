import { describe, expect, it } from 'vitest';

import type { RetrievalCitation, RetrievalSummary } from '@trapmap/contracts';

import {
  assembleResponseBuckets,
  buildEmptyResponse,
  buildRetrievalResponse,
  generateMatchReason,
  toRetrievalMatch,
  type MatchableEntryView,
  type ScoredEntryLike,
} from './index.js';

function createEntry(overrides: Partial<MatchableEntryView> = {}): MatchableEntryView {
  return {
    id: 'entry-1',
    scope: 'global',
    requiredLevel: 0,
    shortcut: 'shortcut',
    detail: 'detail',
    labels: ['deploy'],
    ...overrides,
  };
}

function createScored(
  entry: MatchableEntryView,
  score = 0.8,
): ScoredEntryLike<MatchableEntryView> {
  return { entry, score };
}

function createCitation(): RetrievalCitation {
  return {
    source: { entryId: 'entry-1', scope: 'global', shortcut: 'shortcut' },
    sourceType: 'knowledge',
    snippet: 'snippet',
    tags: [],
    recallChannels: ['semantic'],
    scores: { semantic: 0.8, keyword: null, graph: null, preRerank: 0.8, final: 0.8 },
  };
}

function createSummary(): RetrievalSummary {
  return { text: 'summary text', citations: [createCitation()] };
}

describe('knowledge-read response assembly rules', () => {
  it('renders a human-readable match reason', () => {
    const entry = createEntry({ labels: ['deploy'], scope: 'project' });
    expect(generateMatchReason(entry, 0.8, { scopes: [], labels: ['deploy'] })).toBe(
      'matches labels: deploy (score: 0.80)',
    );
    expect(generateMatchReason(entry, 0.8, { scopes: ['project'], labels: [] })).toBe(
      'scope: project (score: 0.80)',
    );
    expect(generateMatchReason(entry, 0.8, { scopes: [], labels: [] })).toBe(
      'semantic similarity (score: 0.80)',
    );
  });

  it('converts scored entries into retrieval matches with optional decorations', () => {
    const entry = createEntry();
    const match = toRetrievalMatch(createScored(entry), { scopes: [], labels: [] });
    expect(match).toMatchObject({
      entryId: 'entry-1',
      scope: 'global',
      requiredLevel: 0,
      shortcut: 'shortcut',
      detail: 'detail',
      labels: ['deploy'],
      score: 0.8,
    });
    const withCitation = toRetrievalMatch(
      createScored(entry),
      { scopes: [], labels: [] },
      createCitation(),
    );
    expect(withCitation.citation).toEqual(createCitation());
    const withConflicts = toRetrievalMatch(
      createScored(entry),
      { scopes: [], labels: [] },
      undefined,
      [{ entryId: 'entry-2', shortcut: 'other', conflictType: 'alternative', context: 'different approach' }],
    );
    expect(withConflicts.conflicts).toEqual([
      { entryId: 'entry-2', shortcut: 'other', conflictType: 'alternative', context: 'different approach' },
    ]);
  });

  it('splits scored entries into global and project buckets without duplication', () => {
    const { globalConstraints, projectKnowledge } = assembleResponseBuckets(
      [
        createScored(createEntry({ id: 'g1', scope: 'global' })),
        createScored(createEntry({ id: 'p1', scope: 'project' })),
        createScored(createEntry({ id: 'g2', scope: 'global' })),
      ],
      { scopes: [], labels: [] },
    );

    expect(globalConstraints.map((m) => m.entryId)).toEqual(['g1', 'g2']);
    expect(projectKnowledge.map((m) => m.entryId)).toEqual(['p1']);
  });

  it('builds complete and empty retrieval responses', () => {
    const empty = buildEmptyResponse();
    expect(empty).toEqual({
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: null,
    });
    const response = buildRetrievalResponse(
      [{ entryId: 'g1', scope: 'global', requiredLevel: 0, shortcut: '', detail: '', labels: [], score: 0.8, reason: 'semantic similarity (score: 0.80)' }],
      [],
      'refined',
      createSummary(),
    );
    expect(response.globalConstraints).toHaveLength(1);
    expect(response.refinementSummary).toBe('refined');
    expect(response.summary).toEqual(createSummary());
  });
});
