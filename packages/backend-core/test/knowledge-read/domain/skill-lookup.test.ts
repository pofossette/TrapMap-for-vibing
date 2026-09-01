import {
  type RetrievalMatch,
  type SkillSourceKind,
  retrievalMatchSchema,
  skillLookupResponseSchema,
} from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  type SkillLookupArtifactMeta,
  toSkillLookupMatches,
} from '../../../src/knowledge-read/domain/skill-lookup.js';

function createMatch(entryId: string, shortcut: string, score: number): RetrievalMatch {
  return retrievalMatchSchema.parse({
    entryId,
    scope: 'global',
    requiredLevel: 0,
    shortcut,
    detail: `${shortcut} detail`,
    labels: ['docker'],
    score,
    reason: 'semantic similarity',
  });
}

describe('toSkillLookupMatches', () => {
  const meta: SkillLookupArtifactMeta = {
    slug: 'docker-cleanup',
    sourceKind: 'skill-directory',
    title: 'Docker cleanup',
  };

  it('maps artifact matches to the skill lookup result shape', () => {
    const matches = [
      {
        ...createMatch('artifact-1', 'docker cleanup', 0.92),
        labels: ['docker', 'cleanup'],
      },
    ];

    expect(toSkillLookupMatches(matches, new Map([['artifact-1', meta]]))).toEqual([
      {
        artifactId: 'artifact-1',
        title: 'Docker cleanup',
        slug: 'docker-cleanup',
        labels: ['docker', 'cleanup'],
        scope: 'global',
        requiredLevel: 0,
        sourceKind: 'skill-directory',
        score: 0.92,
        reason: 'semantic similarity',
      },
    ]);
  });

  it('filters out entries that are not registered artifacts', () => {
    const artifactMatch = createMatch('artifact-1', 'docker cleanup', 0.8);
    const knowledgeMatch = createMatch('entry-1', 'docker note', 0.9);

    expect(
      toSkillLookupMatches([knowledgeMatch, artifactMatch], new Map([['artifact-1', meta]])),
    ).toHaveLength(1);
    expect(toSkillLookupMatches([knowledgeMatch], new Map()).at(0)?.artifactId).toBeUndefined();
  });

  it('keeps one match per artifact id with its highest score', () => {
    const lower = createMatch('artifact-1', 'docker cleanup', 0.7);
    const higher = { ...createMatch('artifact-1', 'docker cleanup', 0.95) };

    const matches = toSkillLookupMatches(
      [lower, higher],
      new Map([
        ['artifact-1', meta],
        ['artifact-2', meta],
      ]),
    );

    expect(matches).toEqual([expect.objectContaining({ artifactId: 'artifact-1', score: 0.95 })]);
  });

  it('falls back to the retrieval shortcut when artifact metadata has no title', () => {
    const fallbackMeta: SkillLookupArtifactMeta = {
      slug: 'docker-cleanup',
      sourceKind: 'legacy-knowledge',
    };
    const match = createMatch('artifact-2', 'Docker cleanup command', 0.5);

    const result = toSkillLookupMatches([match], new Map([['artifact-2', fallbackMeta]]));

    expect(result[0]?.title).toBe('Docker cleanup command');
    expect(result[0]?.sourceKind).toBe<SkillSourceKind>('legacy-knowledge');
  });

  it('returns an empty schema-valid response for empty input', () => {
    expect(toSkillLookupMatches([], new Map())).toEqual([]);
  });

  it('produces a response accepted by the shared skill lookup schema', () => {
    const match = createMatch('artifact-1', 'docker cleanup', 1);
    const [item] = toSkillLookupMatches([match], new Map([['artifact-1', meta]]));

    expect(skillLookupResponseSchema.parse({ matches: item ? [item] : [] })).toMatchObject({
      matches: [{ artifactId: 'artifact-1', title: 'Docker cleanup' }],
    });
  });
});
