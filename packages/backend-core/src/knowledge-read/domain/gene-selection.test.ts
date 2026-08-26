import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '../../testing/experience-gene-fixtures.js';
import * as selection from './gene-selection.js';

function geneWith(id: string, overrides = {}) {
  const gene = createExperienceGeneFixture();
  return {
    ...gene,
    geneId: id,
    status: 'solidified' as const,
    ...overrides,
  };
}

function candidate(gene: ReturnType<typeof geneWith>, overrides = {}) {
  const eligibleGene = {
    ...gene,
    status: 'solidified' as const,
    validation: ['Verified against a reproduced failure'],
  };
  return {
    gene: eligibleGene,
    semanticScore: 0.8,
    keywordScore: 0.4,
    exactSignalMatch: false,
    errorTextMatch: false,
    boundaryMatch: false,
    freshValidation: false,
    broadMatch: false,
    ...overrides,
  };
}

describe('experience gene selection rules', () => {
  it('merges recall channels with fixed weights and boosts exact signals', () => {
    const merged = selection.rerankExperienceGeneCandidates(
      [candidate(createExperienceGeneFixture(), { exactSignalMatch: true, freshValidation: true })],
      { maxResults: 1 },
    );

    expect(selection.GENE_SEMANTIC_WEIGHT).toBe(0.6);
    expect(selection.GENE_KEYWORD_WEIGHT).toBe(0.4);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.baseScore).toBeCloseTo(0.8 * 0.6 + 0.4 * 0.4);
    expect(merged[0]?.score).toBeCloseTo(0.81);
    expect(merged[0]?.reasons).toEqual(['exact-signal', 'fresh-validation']);
  });

  it('applies named penalties and selects the strongest eligible Gene', () => {
    const strong = geneWith('gene-strong');
    const stale = {
      ...geneWith('gene-stale'),
      status: 'stale' as const,
      validation: [],
    };
    const deprecated = {
      ...geneWith('gene-deprecated'),
      status: 'deprecated' as const,
    };
    const selected = selection.selectExperienceGene([
      candidate(stale),
      candidate(deprecated),
      candidate(strong, { errorTextMatch: true }),
    ]);

    expect(selected?.gene.geneId).toBe('gene-strong');
    expect(selected?.reasons).toContain('error-text-match');
  });

  it('breaks equal scores by lexicographic Gene id', () => {
    const selected = selection.selectExperienceGene([
      candidate(geneWith('gene-b')),
      candidate(geneWith('gene-a')),
    ]);

    expect(selected?.gene.geneId).toBe('gene-a');
  });

  it('keeps only distinct-source avoid warnings that do not conflict with the primary', () => {
    const primaryGene = geneWith('gene-primary');
    const warningGene = {
      ...geneWith('gene-warning'),
      avoid: ['Do not retry without a bounded backoff'],
      source: { ...primaryGene.source, sourceId: 'trap-other', kind: 'trap' },
    };
    const sameSourceGene = geneWith('gene-same-source');
    const conflictingGene = {
      ...geneWith('gene-conflicting'),
      avoid: [...primaryGene.avoid],
      source: { ...primaryGene.source, sourceId: 'trap-conflict', kind: 'trap' },
    };
    const result = selection.selectExperienceGenes(
      [
        candidate(primaryGene, { semanticScore: 0.9 }),
        candidate(warningGene, { semanticScore: 0.7, keywordScore: 0.3 }),
        candidate(sameSourceGene, { semanticScore: 0.7, keywordScore: 0.3 }),
        candidate(conflictingGene, { semanticScore: 0.5, keywordScore: 0.3 }),
      ],
      { maxResults: 1 },
    );

    expect(result.primaryGene?.gene.geneId).toBe('gene-primary');
    expect(result.supplementaryAvoid.map((warning) => warning.geneId)).toEqual(['gene-warning']);
  });
});
